/**
 * NEXUS Signaling Server v2
 * ──────────────────────────
 * • WebRTC SDP / ICE relay
 * • Peer discovery & room management
 * • Web Push notification delivery (VAPID)
 * • Health & metrics endpoints
 *
 * Stack: uWebSockets.js (~6× faster than ws), web-push
 * Scale: swap in-memory Maps for Redis HASH/PUB-SUB for multi-node
 *
 * Deploy: fly.io  →  fly deploy  (see fly.toml)
 */

import uWS      from 'uWebSockets.js';
import webpush  from 'web-push';
import {
  randomAnimeName, PROTOCOL_VERSION,
  HEARTBEAT_MS, PEER_TIMEOUT_MS,
} from '@nexus/shared';
import type { SignalingMessage, PeerInfo, RoomInfo, PushPayload } from '@nexus/shared';

const PORT  = Number(process.env.PORT  ?? 8787);
const ENV   = process.env.NODE_ENV     ?? 'development';
const log   = (...a: unknown[]) => ENV !== 'test' && console.log('[nexus]', ...a);
const warn  = (...a: unknown[]) => ENV !== 'test' && console.warn('[nexus]', ...a);

// ── VAPID ─────────────────────────────────────────────────────────────────────
const VAPID_PUB  = process.env.VAPID_PUBLIC_KEY  ?? '';
const VAPID_PRIV = process.env.VAPID_PRIVATE_KEY ?? '';
const VAPID_MAIL = process.env.VAPID_CONTACT     ?? 'mailto:mail@nexusgo.me';

if (VAPID_PUB && VAPID_PRIV) {
  webpush.setVapidDetails(VAPID_MAIL, VAPID_PUB, VAPID_PRIV);
  log('VAPID configured ✓');
} else {
  warn('No VAPID keys — push disabled. Run: npx web-push generate-vapid-keys');
}

// ── Stores ────────────────────────────────────────────────────────────────────
interface ConnectedPeer {
  id:       string;
  name:     string;
  ws:       uWS.WebSocket<unknown>;
  lastSeen: number;
  push?:    webpush.PushSubscription;
  rooms:    Set<string>;
}

interface Room extends RoomInfo {
  memberSet: Set<string>;
}

const peers = new Map<string, ConnectedPeer>();
const rooms = new Map<string, Room>();

// ── Helpers ───────────────────────────────────────────────────────────────────
const enc = (msg: SignalingMessage) => JSON.stringify(msg);

function send(ws: uWS.WebSocket<unknown>, msg: SignalingMessage) {
  try { ws.send(enc(msg), false, true); } catch {}
}
function sendTo(id: string, msg: SignalingMessage) {
  const p = peers.get(id); if (p) send(p.ws, msg);
}
function broadcast(msg: SignalingMessage, exclude?: string) {
  const raw = enc(msg);
  for (const [id, p] of peers) if (id !== exclude) try { p.ws.send(raw, false, true); } catch {}
}
function broadcastRoom(roomId: string, msg: SignalingMessage, exclude?: string) {
  const room = rooms.get(roomId); if (!room) return;
  for (const mid of room.memberSet) if (mid !== exclude) sendTo(mid, msg);
}
function peerList(exclude?: string): PeerInfo[] {
  return [...peers.values()]
    .filter(p => p.id !== exclude)
    .map(p => ({ id: p.id, name: p.name, ts: p.lastSeen }));
}
function roomMembers(room: Room): PeerInfo[] {
  return [...room.memberSet].map(id => {
    const p = peers.get(id);
    return p ? { id: p.id, name: p.name, ts: p.lastSeen } : null;
  }).filter(Boolean) as PeerInfo[];
}

async function pushNotify(targetId: string, payload: PushPayload) {
  const target = peers.get(targetId);
  if (!target?.push || !VAPID_PUB) return;
  try {
    await webpush.sendNotification(target.push, JSON.stringify(payload));
  } catch (e: any) {
    if (e.statusCode === 410 || e.statusCode === 404) target.push = undefined;
    else warn('push failed:', e.message);
  }
}

function removePeer(id: string, ws?: uWS.WebSocket<unknown>) {
  const peer = peers.get(id); if (!peer) return;
  if (ws && peer.ws !== ws) {
    log(`[keep] close triggered for old/different connection of ${peer.name} (${id})`);
    return;
  }
  // Leave all rooms
  for (const roomId of peer.rooms) {
    const room = rooms.get(roomId); if (!room) continue;
    room.memberSet.delete(id);
    room.members = roomMembers(room);
    broadcastRoom(roomId, { type: 'room-left', roomId, payload: { id } });
    if (room.memberSet.size === 0) rooms.delete(roomId);
  }
  peers.delete(id);
  broadcast({ type: 'peer-left', payload: { id } });
  log(`[-] ${peer.name} (${id}) | online: ${peers.size}`);
}

// ── Server ────────────────────────────────────────────────────────────────────
uWS.App()
  .ws<{ id?: string }>('/*', {
    compression:      uWS.SHARED_COMPRESSOR,
    maxPayloadLength: 768 * 1024,   // 768 KB (SDP + ICE only; file data goes P2P)
    idleTimeout:      120,
    maxBackpressure:  1024 * 1024,

    open(_ws) {},

    message(ws, rawMsg) {
      let msg: SignalingMessage;
      try { msg = JSON.parse(Buffer.from(rawMsg).toString()); } catch { return; }

      const selfId: string | undefined = (ws as any).id;

      switch (msg.type) {

        // ── Register ──────────────────────────────────────────────────────────
        case 'register': {
          const id   = ((msg.from ?? '').trim() || crypto.randomUUID().slice(0, 16));
          const name = ((msg.payload as any)?.name ?? randomAnimeName()).slice(0, 64);
          (ws as any).id = id;

          const existing = peers.get(id);
          if (existing && existing.ws !== ws) {
            log(`[cleanup] closing old socket for ${name} (${id})`);
            (existing.ws as any).id = undefined;
            try { existing.ws.close(); } catch {}
          }

          peers.set(id, { id, name, ws, lastSeen: Date.now(), rooms: new Set() });
          log(`[+] ${name} (${id}) | online: ${peers.size}`);
          // Respond: peer list + VAPID key
          send(ws, { type: 'peer-list',  payload: peerList(id) });
          send(ws, { type: 'vapid-key',  payload: VAPID_PUB || null });
          // Announce to others
          broadcast({ type: 'peer-joined', payload: { id, name } }, id);
          break;
        }

        // ── WebRTC relay ──────────────────────────────────────────────────────
        case 'offer':
        case 'answer':
        case 'ice-candidate': {
          if (!selfId || !msg.to) return;
          const target = peers.get(msg.to);
          if (!target) { send(ws, { type: 'error', payload: 'peer-not-found' }); return; }
          send(target.ws, { ...msg, from: selfId });
          break;
        }

        // ── Push ──────────────────────────────────────────────────────────────
        case 'push-subscribe': {
          if (!selfId) return;
          const peer = peers.get(selfId);
          if (peer && msg.payload) {
            peer.push = msg.payload as webpush.PushSubscription;
            log(`[push] ${peer.name} subscribed`);
          }
          break;
        }
        case 'push-unsubscribe': {
          const peer = selfId ? peers.get(selfId) : undefined;
          if (peer) peer.push = undefined;
          break;
        }
        case 'push-notify': {
          if (!selfId || !msg.to || !msg.payload) return;
          // Relay to target peer (they may be awake) + fire push (they may be asleep)
          sendTo(msg.to, { ...msg, from: selfId });
          pushNotify(msg.to, msg.payload as PushPayload);
          break;
        }

        // ── Rooms ─────────────────────────────────────────────────────────────
        case 'room-create': {
          if (!selfId) return;
          const self = peers.get(selfId)!;
          const name = ((msg.payload as any)?.name ?? 'Room').slice(0, 60);
          const id   = Math.random().toString(36).slice(2, 10);
          const room: Room = {
            id, name, createdBy: selfId, createdAt: Date.now(),
            members: [{ id: selfId, name: self.name, ts: Date.now() }],
            memberSet: new Set([selfId]),
          };
          rooms.set(id, room);
          self.rooms.add(id);
          send(ws, { type: 'room-info', roomId: id, payload: { id, name, members: room.members, createdBy: selfId, createdAt: room.createdAt } });
          log(`[room] created "${name}" (${id}) by ${self.name}`);
          break;
        }
        case 'room-join': {
          if (!selfId || !msg.roomId) return;
          const room = rooms.get(msg.roomId);
          const self = peers.get(selfId);
          if (!room || !self) { send(ws, { type: 'error', payload: 'room-not-found' }); return; }
          if (room.memberSet.has(selfId)) {
            // Already in — just resend member list
            send(ws, { type: 'room-members', roomId: msg.roomId, payload: { name: room.name, members: roomMembers(room) } });
            return;
          }
          room.memberSet.add(selfId);
          room.members = roomMembers(room);
          self.rooms.add(msg.roomId);
          send(ws, { type: 'room-members', roomId: msg.roomId, payload: { name: room.name, members: roomMembers(room) } });
          broadcastRoom(msg.roomId, { type: 'room-joined', roomId: msg.roomId, payload: { id: selfId, name: self.name } }, selfId);
          log(`[room] ${self.name} joined ${msg.roomId}`);
          break;
        }
        case 'room-leave': {
          if (!selfId || !msg.roomId) return;
          const room = rooms.get(msg.roomId);
          if (!room) return;
          room.memberSet.delete(selfId);
          room.members = roomMembers(room);
          const self = peers.get(selfId);
          if (self) self.rooms.delete(msg.roomId);
          broadcastRoom(msg.roomId, { type: 'room-left', roomId: msg.roomId, payload: { id: selfId } });
          if (room.memberSet.size === 0) rooms.delete(msg.roomId);
          break;
        }
        case 'room-list': {
          const list = [...rooms.values()].map(r => ({
            id: r.id, name: r.name, members: r.members,
            createdBy: r.createdBy, createdAt: r.createdAt,
          }));
          send(ws, { type: 'room-list', payload: list });
          break;
        }

        // ── Heartbeat ─────────────────────────────────────────────────────────
        case 'heartbeat': {
          if (selfId) { const p = peers.get(selfId); if (p) p.lastSeen = Date.now(); }
          break;
        }
      }
    },

    close(ws) {
      const id: string | undefined = (ws as any).id;
      if (id) removePeer(id, ws);
    },
  })

  .get('/health', res => {
    res.cork(() => {
      res.writeStatus('200 OK')
         .writeHeader('Content-Type', 'application/json')
         .end(JSON.stringify({ ok: true, peers: peers.size, rooms: rooms.size, version: PROTOCOL_VERSION, ts: Date.now() }));
    });
  })

  .get('/vapid-public-key', res => {
    res.cork(() => {
      res.writeStatus('200 OK')
         .writeHeader('Content-Type', 'text/plain')
         .writeHeader('Access-Control-Allow-Origin', '*')
         .end(VAPID_PUB || '');
    });
  })

  .get('/metrics', res => {
    res.cork(() => {
      res.writeStatus('200 OK')
         .writeHeader('Content-Type', 'text/plain')
         .end([
           `# HELP nexus_peers_total Connected peers`,
           `# TYPE nexus_peers_total gauge`,
           `nexus_peers_total ${peers.size}`,
           `# HELP nexus_rooms_total Active rooms`,
           `# TYPE nexus_rooms_total gauge`,
           `nexus_rooms_total ${rooms.size}`,
         ].join('\n') + '\n');
    });
  })

  .listen(PORT, token => {
    if (token) log(`listening on :${PORT} (${ENV})`);
    else       { console.error(`failed to bind :${PORT}`); process.exit(1); }
  });

// ── Stale-peer eviction ───────────────────────────────────────────────────────
setInterval(() => {
  const cutoff = Date.now() - PEER_TIMEOUT_MS;
  for (const [id, p] of peers) {
    if (p.lastSeen < cutoff) {
      log(`[evict] ${p.name} (${id})`);
      try { p.ws.close(); } catch {}
      removePeer(id);
    }
  }
}, HEARTBEAT_MS);
