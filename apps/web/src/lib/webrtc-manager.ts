/**
 * NEXUS WebRTCManager v2 — complete P2P engine
 * ─────────────────────────────────────────────
 * • Perfect-negotiation (RFC 8829) — collision-free offer/answer
 * • High-throughput file transfer: 256 KB chunks + backpressure
 * • Voice & video calls: getUserMedia → addTrack → renegotiate
 * • Voice messages: MediaRecorder → chunked send
 * • Group rooms: mesh broadcast over N DataChannels
 * • Web Push: subscribe/unsubscribe, relay through signaling
 * • Ping/pong latency tracking per peer
 */

import {
  ICE_SERVERS, CHUNK_SIZE, VOICE_CHUNK, PROTOCOL_VERSION,
  HEARTBEAT_MS, MAX_FILE_SIZE, RING_TIMEOUT_MS,
  initials, randomAnimeName,
} from '@nexus/shared';
import type {
  SignalingMessage, DataMsg, PushPayload, CallKind,
  ChatMsg, FileMeta, FileChunk, FileDone,
  VoiceMeta, VoiceChunk,
  CallInvite, CallAnswer, CallEnd,
  GroupMsg,
} from '@nexus/shared';
import { nanoid } from 'nanoid';

// ── Public types ──────────────────────────────────────────────────────────────
export interface RemotePeer {
  id: string;
  name: string;
  initials: string;
  pingMs: number | null;
  connected: boolean;
  lastSeen: number;
}

export interface LocalMessage {
  id: string;
  peerId: string;
  mine: boolean;
  text?: string;
  file?: {
    name: string;
    size: number;
    mime?: string;
    url?: string;
    progress: number;
    done: boolean;
    speed?: string;
    eta?: string;
  };
  voice?: {
    durationMs: number;
    url?: string;
    progress: number;
    done: boolean;
  };
  ts: number;
  read: boolean;
}

export type CallState = 'ringing-out' | 'ringing-in' | 'active' | 'ended';

export interface ActiveCall {
  callId: string;
  peerId: string;
  peerName: string;
  kind: CallKind;
  state: CallState;
  startedAt?: number;
  localStream?: MediaStream;
  remoteStream?: MediaStream;
  muted: boolean;
  videoOff: boolean;
}

export interface GroupRoom {
  id: string;
  name: string;
  members: RemotePeer[];
  createdBy: string;
  createdAt: number;
}

export type ManagerEvent =
  | { type: 'peer-added';          peer: RemotePeer }
  | { type: 'peer-updated';        peer: RemotePeer }
  | { type: 'peer-removed';        peerId: string }
  | { type: 'message';             msg: LocalMessage }
  | { type: 'typing';              peerId: string }
  | { type: 'file-progress';       peerId: string; fileId: string; progress: number; url?: string; speed?: string; eta?: string }
  | { type: 'voice-progress';      peerId: string; voiceId: string; progress: number; url?: string }
  | { type: 'call-updated';        call: ActiveCall }
  | { type: 'call-ended';          callId: string; reason?: string }
  | { type: 'group-message';       roomId: string; msg: LocalMessage }
  | { type: 'room-updated';        room: GroupRoom }
  | { type: 'room-removed';        roomId: string }
  | { type: 'ws-connected' }
  | { type: 'ws-disconnected' };

// ── Internal state ────────────────────────────────────────────────────────────
interface IncomingFile {
  name: string; size: number; mime: string;
  chunks: (string | null)[];
  received: number;
  startedAt: number;
  bytesIn: number;
}
interface IncomingVoice {
  durationMs: number;
  chunks: (string | null)[];
  received: number;
}
interface PeerConn {
  info:         RemotePeer;
  pc:           RTCPeerConnection;
  dc:           RTCDataChannel | null;
  makingOffer:  boolean;
  ignoreOffer:  boolean;
  pingTimer:    ReturnType<typeof setInterval> | null;
  inFiles:      Map<string, IncomingFile>;
  inVoice:      Map<string, IncomingVoice>;
}

// ── Manager ───────────────────────────────────────────────────────────────────
export class WebRTCManager {
  readonly myId:  string;
  myName:         string;

  private ws:            WebSocket | null = null;
  private peers:         Map<string, PeerConn> = new Map();
  private handlers:      Array<(ev: ManagerEvent) => void> = [];
  private wsTimer:       ReturnType<typeof setTimeout>  | null = null;
  private hbTimer:       ReturnType<typeof setInterval> | null = null;
  private wsAttempts     = 0;
  private readonly sigUrl: string;

  private activeCall:    ActiveCall | null = null;
  private ringTimer:     ReturnType<typeof setTimeout> | null = null;

  private rooms:         Map<string, GroupRoom> = new Map();
  private vapidKey       = '';
  private pushSub:       PushSubscription | null = null;

  constructor(signalingUrl: string) {
    this.sigUrl  = signalingUrl;
    const ls     = typeof localStorage !== 'undefined';
    this.myId    = (ls && localStorage.getItem('nexus_id'))   || nanoid(16);
    this.myName  = (ls && localStorage.getItem('nexus_name')) || randomAnimeName();
    if (ls) localStorage.setItem('nexus_id', this.myId);
  }

  // ── Event bus ─────────────────────────────────────────────────────────────
  on(handler: (ev: ManagerEvent) => void): () => void {
    this.handlers.push(handler);
    return () => { this.handlers = this.handlers.filter(h => h !== handler); };
  }
  private emit(ev: ManagerEvent) { this.handlers.forEach(h => h(ev)); }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  connect() { this.connectWS(); }

  disconnect() {
    if (this.hbTimer)  clearInterval(this.hbTimer);
    if (this.wsTimer)  clearTimeout(this.wsTimer);
    if (this.ringTimer) clearTimeout(this.ringTimer);
    this.ws?.close();
    for (const conn of this.peers.values()) {
      if (conn.pingTimer) clearInterval(conn.pingTimer);
      try { conn.pc.close(); } catch {}
    }
    this.peers.clear();
  }

  // ── Identity ──────────────────────────────────────────────────────────────
  setName(name: string) {
    this.myName = name;
    if (typeof localStorage !== 'undefined') localStorage.setItem('nexus_name', name);
    this.peers.forEach(c => this.dc_send(c, { type: 'hello', name, version: PROTOCOL_VERSION }));
    // Re-register with new name
    this.sig({ type: 'register', from: this.myId, payload: { name } });
  }

  // ── 1-to-1 chat ───────────────────────────────────────────────────────────
  sendChat(peerId: string, text: string): string {
    const conn = this.requireOpen(peerId);
    const msgId = nanoid();
    this.dc_send(conn, { type: 'chat', text, ts: Date.now(), msgId });
    return msgId;
  }

  sendTyping(peerId: string) {
    const c = this.peers.get(peerId);
    if (c?.dc?.readyState === 'open') this.dc_send(c, { type: 'typing' });
  }

  // ── File transfer ─────────────────────────────────────────────────────────
  async sendFile(
    peerId: string,
    file: File,
    onProgress?: (pct: number, speed: string, eta: string) => void,
  ): Promise<string> {
    const conn = this.requireOpen(peerId);
    if (file.size > MAX_FILE_SIZE) throw new Error('File exceeds 2 GB limit');

    const fileId      = nanoid();
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    this.dc_send(conn, {
      type: 'file-meta', fileId,
      name: file.name, size: file.size,
      mime: file.type || 'application/octet-stream',
      totalChunks, chunkSize: CHUNK_SIZE,
    });

    const t0       = Date.now();
    let bytesSent  = 0;

    for (let i = 0; i < totalChunks; i++) {
      // Backpressure — yield when buffer is near full
      while (conn.dc && conn.dc.readyState === 'open' && conn.dc.bufferedAmount > 16 * 1024 * 1024) {
        await new Promise(r => setTimeout(r, 8));
      }
      if (!conn.dc || conn.dc.readyState !== 'open') throw new Error('Connection lost during transfer');

      const sliceBuf = await file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE).arrayBuffer();
      const b64      = this.ab2b64(sliceBuf);
      this.dc_send(conn, { type: 'file-chunk', fileId, index: i, data: b64, total: totalChunks });

      bytesSent += sliceBuf.byteLength;
      const elapsed = Math.max((Date.now() - t0) / 1000, 0.01);
      const bps     = bytesSent / elapsed;
      const remain  = (file.size - bytesSent) / bps;
      const pct     = Math.round((bytesSent / file.size) * 100);
      const speed   = this.fmtSpeed(bps);
      const eta     = this.fmtETA(remain);

      this.emit({ type: 'file-progress', peerId, fileId, progress: pct, speed, eta });
      onProgress?.(pct, speed, eta);

      // Yield to event loop every 20 chunks (~5 MB)
      if (i % 20 === 0) await new Promise(r => setTimeout(r, 0));
    }

    this.dc_send(conn, { type: 'file-done', fileId });
    this.emit({ type: 'file-progress', peerId, fileId, progress: 100 });
    return fileId;
  }

  // ── Voice messages ────────────────────────────────────────────────────────
  async sendVoiceMessage(peerId: string, blob: Blob, durationMs: number): Promise<string> {
    const conn        = this.requireOpen(peerId);
    const voiceId     = nanoid();
    const buf         = await blob.arrayBuffer();
    const totalChunks = Math.ceil(buf.byteLength / VOICE_CHUNK);

    this.dc_send(conn, { type: 'voice-meta', voiceId, durationMs, size: buf.byteLength, totalChunks });

    for (let i = 0; i < totalChunks; i++) {
      const slice = buf.slice(i * VOICE_CHUNK, (i + 1) * VOICE_CHUNK);
      this.dc_send(conn, { type: 'voice-chunk', voiceId, index: i, data: this.ab2b64(slice), total: totalChunks });
      if (i % 4 === 0) await new Promise(r => setTimeout(r, 0));
    }
    return voiceId;
  }

  // ── Calls ─────────────────────────────────────────────────────────────────
  async startCall(peerId: string, kind: CallKind): Promise<void> {
    if (this.activeCall) throw new Error('Already in a call');
    const conn = this.peers.get(peerId);
    if (!conn?.dc || conn.dc.readyState !== 'open') throw new Error('Peer not connected');

    const constraints = kind === 'video'
      ? { audio: true, video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } }
      : { audio: true, video: false };

    const localStream = await navigator.mediaDevices.getUserMedia(constraints as MediaStreamConstraints);
    localStream.getTracks().forEach(t => conn.pc.addTrack(t, localStream));

    const callId = nanoid();
    this.activeCall = { callId, peerId, peerName: conn.info.name, kind, state: 'ringing-out', localStream, muted: false, videoOff: false };
    this.emit({ type: 'call-updated', call: { ...this.activeCall } });

    this.dc_send(conn, { type: 'call-invite', callId, kind, callerName: this.myName });

    // Also send push via signaling so receiver can be woken
    this.sig({
      type: 'push-notify', from: this.myId, to: peerId,
      payload: {
        type: 'call', title: `📞 Incoming ${kind} call`,
        body: `${this.myName} is calling you`,
        fromId: this.myId, fromName: this.myName,
        callId, callKind: kind,
        url: typeof window !== 'undefined' ? window.location.origin : '',
      } satisfies PushPayload,
    });

    // Ring timeout
    this.ringTimer = setTimeout(() => this.endCall('no-answer'), RING_TIMEOUT_MS);
  }

  async answerCall(callId: string, accepted: boolean): Promise<void> {
    if (!this.activeCall || this.activeCall.callId !== callId) return;
    const conn = this.peers.get(this.activeCall.peerId);
    if (!conn) return;

    if (this.ringTimer) { clearTimeout(this.ringTimer); this.ringTimer = null; }

    if (!accepted) {
      this.dc_send(conn, { type: 'call-answer', callId, accepted: false });
      this.activeCall.localStream?.getTracks().forEach(t => t.stop());
      this.emit({ type: 'call-ended', callId, reason: 'declined' });
      this.activeCall = null;
      return;
    }

    const constraints = this.activeCall.kind === 'video'
      ? { audio: true, video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } }
      : { audio: true, video: false };
    const localStream = await navigator.mediaDevices.getUserMedia(constraints as MediaStreamConstraints);
    localStream.getTracks().forEach(t => conn.pc.addTrack(t, localStream));

    this.activeCall = { ...this.activeCall, localStream, state: 'active', startedAt: Date.now() };
    this.emit({ type: 'call-updated', call: { ...this.activeCall } });
    this.dc_send(conn, { type: 'call-answer', callId, accepted: true });
  }

  endCall(reason?: string) {
    if (!this.activeCall) return;
    const { callId, peerId, localStream } = this.activeCall;
    if (this.ringTimer) { clearTimeout(this.ringTimer); this.ringTimer = null; }
    localStream?.getTracks().forEach(t => t.stop());
    const conn = this.peers.get(peerId);
    if (conn) {
      this.dc_send(conn, { type: 'call-end', callId, reason });
      // Remove media senders
      conn.pc.getSenders().forEach(s => { try { conn.pc.removeTrack(s); } catch {} });
    }
    this.emit({ type: 'call-ended', callId, reason });
    this.activeCall = null;
  }

  toggleMute(): boolean {
    if (!this.activeCall) return false;
    const track = this.activeCall.localStream?.getAudioTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    this.activeCall = { ...this.activeCall, muted: !track.enabled };
    this.emit({ type: 'call-updated', call: { ...this.activeCall } });
    return this.activeCall.muted;
  }

  toggleVideo(): boolean {
    if (!this.activeCall) return false;
    const track = this.activeCall.localStream?.getVideoTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    this.activeCall = { ...this.activeCall, videoOff: !track.enabled };
    this.emit({ type: 'call-updated', call: { ...this.activeCall } });
    return this.activeCall.videoOff;
  }

  getActiveCall(): ActiveCall | null { return this.activeCall; }

  // ── Groups ────────────────────────────────────────────────────────────────
  createRoom(name: string) { this.sig({ type: 'room-create', from: this.myId, payload: { name } }); }
  joinRoom(roomId: string) { this.sig({ type: 'room-join',   from: this.myId, roomId }); }
  leaveRoom(roomId: string) {
    this.sig({ type: 'room-leave', from: this.myId, roomId });
    this.rooms.delete(roomId);
    this.emit({ type: 'room-removed', roomId });
  }
  listRooms() { this.sig({ type: 'room-list', from: this.myId }); }

  sendGroupMessage(roomId: string, text: string): string {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Not in room');
    const msgId = nanoid();
    for (const m of room.members) {
      if (m.id === this.myId) continue;
      const conn = this.peers.get(m.id);
      if (conn?.dc?.readyState === 'open') {
        this.dc_send(conn, { type: 'group-msg', roomId, text, ts: Date.now(), msgId, senderName: this.myName, senderId: this.myId });
      }
    }
    return msgId;
  }

  getRooms(): GroupRoom[] { return [...this.rooms.values()]; }

  // ── Push notifications ────────────────────────────────────────────────────
  async subscribePush(): Promise<boolean> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;

    // Get VAPID key from server if we don't have it
    if (!this.vapidKey) {
      try {
        const httpBase = this.sigUrl.replace(/^ws/, 'http');
        const res = await fetch(`${httpBase}/vapid-public-key`);
        if (res.ok) this.vapidKey = (await res.text()).trim();
      } catch {}
    }
    if (!this.vapidKey) return false;

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlB64ToUint8(this.vapidKey) as any,
      });
      this.pushSub = sub;
      this.sig({ type: 'push-subscribe', from: this.myId, payload: sub.toJSON() });
      return true;
    } catch (e) {
      console.warn('[push] subscribe failed', e);
      return false;
    }
  }

  async requestNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    const result = await Notification.requestPermission();
    return result === 'granted';
  }

  // ── Peer management ───────────────────────────────────────────────────────
  connectToPeer(id: string) {
    if (id && id !== this.myId && !this.peers.has(id)) this.createConn(id, true);
  }
  getPeers(): RemotePeer[] { return [...this.peers.values()].map(c => ({ ...c.info })); }

  // ── WebSocket (signaling) ─────────────────────────────────────────────────
  private connectWS() {
    if (this.ws) { this.ws.onclose = null; this.ws.close(); this.ws = null; }
    try {
      const ws = new WebSocket(this.sigUrl);
      this.ws  = ws;

      ws.onopen = () => {
        this.wsAttempts = 0;
        this.sig({ type: 'register', from: this.myId, payload: { name: this.myName } });
        this.emit({ type: 'ws-connected' });
        if (this.hbTimer) clearInterval(this.hbTimer);
        this.hbTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) this.sig({ type: 'heartbeat', from: this.myId });
        }, HEARTBEAT_MS);
        // Re-send push subscription if we have one
        if (this.pushSub) {
          this.sig({ type: 'push-subscribe', from: this.myId, payload: this.pushSub.toJSON() });
        }
      };

      ws.onmessage = e => { try { this.handleSig(JSON.parse(e.data)); } catch {} };
      ws.onerror   = () => {};
      ws.onclose   = () => {
        this.emit({ type: 'ws-disconnected' });
        const delay = Math.min(500 * Math.pow(2, this.wsAttempts++), 30_000);
        this.wsTimer = setTimeout(() => this.connectWS(), delay);
      };
    } catch {
      const delay = Math.min(500 * Math.pow(2, this.wsAttempts++), 30_000);
      this.wsTimer = setTimeout(() => this.connectWS(), delay);
    }
  }

  private sig(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private handleSig(msg: { type: string; from?: string; to?: string; roomId?: string; payload?: unknown }) {
    switch (msg.type) {
      case 'peer-list': {
        (msg.payload as Array<{ id: string; name: string }>).forEach(p => {
          if (p.id !== this.myId) this.createConn(p.id, true, p.name);
        });
        break;
      }
      case 'peer-joined': {
        const { id, name } = msg.payload as { id: string; name: string };
        if (id !== this.myId && !this.peers.has(id)) this.createConn(id, false, name);
        break;
      }
      case 'peer-left': {
        this.removeConn((msg.payload as { id: string }).id);
        break;
      }
      case 'offer':         if (msg.from) this.handleOffer(msg.from,  msg.payload as RTCSessionDescriptionInit); break;
      case 'answer':        if (msg.from) this.handleAnswer(msg.from, msg.payload as RTCSessionDescriptionInit); break;
      case 'ice-candidate': if (msg.from) this.handleICE(msg.from,    msg.payload as RTCIceCandidateInit);       break;

      case 'vapid-key': {
        if (msg.payload && typeof msg.payload === 'string') this.vapidKey = msg.payload;
        break;
      }

      case 'room-info':
      case 'room-members': {
        if (!msg.roomId) return;
        const d       = msg.payload as any;
        const members = (d.members ?? []).map((m: any) => this.peerInfoToRemote(m));
        const room: GroupRoom = {
          id: msg.roomId, name: d.name ?? msg.roomId,
          members, createdBy: d.createdBy ?? '', createdAt: d.createdAt ?? Date.now(),
        };
        this.rooms.set(msg.roomId, room);
        this.emit({ type: 'room-updated', room });
        members.forEach((m: RemotePeer) => { if (m.id !== this.myId) this.connectToPeer(m.id); });
        break;
      }
      case 'room-joined': {
        const { id, name } = msg.payload as { id: string; name: string };
        const room = this.rooms.get(msg.roomId!);
        if (room && !room.members.find(m => m.id === id)) {
          const existing = this.peers.get(id);
          room.members.push(existing?.info ?? this.peerInfoToRemote({ id, name, ts: Date.now() }));
          this.emit({ type: 'room-updated', room });
          this.connectToPeer(id);
        }
        break;
      }
      case 'room-left': {
        const { id } = msg.payload as { id: string };
        const room = this.rooms.get(msg.roomId!);
        if (room) {
          room.members = room.members.filter(m => m.id !== id);
          this.emit({ type: 'room-updated', room });
        }
        break;
      }
      case 'room-list': {
        (msg.payload as any[]).forEach(r => {
          if (!this.rooms.has(r.id)) {
            const room: GroupRoom = { id: r.id, name: r.name, members: [], createdBy: r.createdBy, createdAt: r.createdAt };
            this.rooms.set(r.id, room);
            this.emit({ type: 'room-updated', room });
          }
        });
        break;
      }

      // Push-notify relayed from another peer
      case 'push-notify': {
        // Nothing to do client-side when received — SW handles the notification
        break;
      }
    }
  }

  // ── RTCPeerConnection ─────────────────────────────────────────────────────
  private createConn(peerId: string, polite: boolean, name?: string) {
    if (this.peers.has(peerId)) return;
    const pc   = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const info: RemotePeer = {
      id: peerId, name: name ?? '…', initials: initials(name ?? '?'),
      pingMs: null, connected: false, lastSeen: Date.now(),
    };
    const conn: PeerConn = { info, pc, dc: null, makingOffer: false, ignoreOffer: false, pingTimer: null, inFiles: new Map(), inVoice: new Map() };
    this.peers.set(peerId, conn);
    this.emit({ type: 'peer-added', peer: { ...info } });

    // Perfect negotiation
    pc.onnegotiationneeded = async () => {
      try {
        conn.makingOffer = true;
        await pc.setLocalDescription();
        this.sig({ type: 'offer', from: this.myId, to: peerId, payload: pc.localDescription });
      } catch (e) { console.warn('negotiation error', e); }
      finally { conn.makingOffer = false; }
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.sig({ type: 'ice-candidate', from: this.myId, to: peerId, payload: candidate });
    };

    pc.onconnectionstatechange = () => {
      info.connected = pc.connectionState === 'connected';
      this.emit({ type: 'peer-updated', peer: { ...info } });
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.removeConn(peerId);
    };

    pc.ontrack = ({ streams }) => {
      if (this.activeCall?.peerId === peerId && streams[0]) {
        this.activeCall = { ...this.activeCall, remoteStream: streams[0] };
        this.emit({ type: 'call-updated', call: { ...this.activeCall } });
      }
    };

    pc.ondatachannel = ({ channel }) => this.setupDC(conn, channel);
    if (polite) {
      const dc = pc.createDataChannel('nexus', { ordered: true });
      this.setupDC(conn, dc);
    }
  }

  private async handleOffer(from: string, sdp: RTCSessionDescriptionInit) {
    if (!this.peers.has(from)) this.createConn(from, false);
    const conn = this.peers.get(from)!;
    const collision = sdp.type === 'offer' && (conn.makingOffer || conn.pc.signalingState !== 'stable');
    conn.ignoreOffer = collision;
    if (conn.ignoreOffer) return;
    await conn.pc.setRemoteDescription(sdp);
    if (sdp.type === 'offer') {
      await conn.pc.setLocalDescription();
      this.sig({ type: 'answer', from: this.myId, to: from, payload: conn.pc.localDescription });
    }
  }

  private async handleAnswer(from: string, sdp: RTCSessionDescriptionInit) {
    const conn = this.peers.get(from);
    if (!conn || conn.pc.signalingState !== 'have-local-offer') return;
    try { await conn.pc.setRemoteDescription(sdp); } catch {}
  }

  private async handleICE(from: string, candidate: RTCIceCandidateInit) {
    const conn = this.peers.get(from);
    if (!conn) return;
    try { await conn.pc.addIceCandidate(candidate); } catch {}
  }

  private setupDC(conn: PeerConn, dc: RTCDataChannel) {
    conn.dc = dc;
    dc.binaryType = 'arraybuffer';

    dc.onopen = () => {
      conn.info.connected = true;
      this.emit({ type: 'peer-updated', peer: { ...conn.info } });
      this.dc_send(conn, { type: 'hello', name: this.myName, version: PROTOCOL_VERSION });
      conn.pingTimer = setInterval(() => {
        if (dc.readyState === 'open') this.dc_send(conn, { type: 'ping', ts: Date.now() });
      }, 5_000);
    };

    dc.onclose = () => {
      conn.info.connected = false;
      this.emit({ type: 'peer-updated', peer: { ...conn.info } });
      if (conn.pingTimer) { clearInterval(conn.pingTimer); conn.pingTimer = null; }
    };

    dc.onmessage = ({ data }) => {
      try { this.handleDC(conn, JSON.parse(data as string)); } catch {}
    };
  }

  private dc_send(conn: PeerConn, msg: DataMsg) {
    if (conn.dc?.readyState === 'open') try { conn.dc.send(JSON.stringify(msg)); } catch {}
  }

  private handleDC(conn: PeerConn, msg: DataMsg) {
    conn.info.lastSeen = Date.now();
    const pid = conn.info.id;

    switch (msg.type) {
      // ── Presence ────────────────────────────────────────────────────────
      case 'hello':
        conn.info.name = msg.name;
        conn.info.initials = initials(msg.name);
        this.emit({ type: 'peer-updated', peer: { ...conn.info } });
        break;

      case 'ping': this.dc_send(conn, { type: 'pong', ts: msg.ts }); break;
      case 'pong':
        conn.info.pingMs = Date.now() - msg.ts;
        this.emit({ type: 'peer-updated', peer: { ...conn.info } });
        break;

      // ── Chat ─────────────────────────────────────────────────────────────
      case 'chat':
        this.emit({ type: 'message', msg: { id: msg.msgId, peerId: pid, mine: false, text: msg.text, ts: msg.ts, read: false } });
        break;

      case 'typing':
        this.emit({ type: 'typing', peerId: pid });
        break;

      // ── File transfer ─────────────────────────────────────────────────────
      case 'file-meta': {
        conn.inFiles.set(msg.fileId, {
          name: msg.name, size: msg.size, mime: msg.mime,
          chunks: new Array(msg.totalChunks).fill(null),
          received: 0, startedAt: Date.now(), bytesIn: 0,
        });
        this.emit({ type: 'message', msg: { id: msg.fileId, peerId: pid, mine: false, file: { name: msg.name, size: msg.size, mime: msg.mime, progress: 0, done: false }, ts: Date.now(), read: false } });
        break;
      }
      case 'file-chunk': {
        const tf = conn.inFiles.get(msg.fileId);
        if (!tf || tf.chunks[msg.index] !== null) break;
        tf.chunks[msg.index] = msg.data;
        tf.received++;
        tf.bytesIn += Math.floor(tf.size / tf.chunks.length);
        const elapsed = Math.max((Date.now() - tf.startedAt) / 1000, 0.01);
        const bps     = tf.bytesIn / elapsed;
        const pct     = Math.round((tf.received / tf.chunks.length) * 100);
        this.emit({ type: 'file-progress', peerId: pid, fileId: msg.fileId, progress: pct, speed: this.fmtSpeed(bps), eta: this.fmtETA((tf.size - tf.bytesIn) / bps) });
        break;
      }
      case 'file-done': {
        const tf = conn.inFiles.get(msg.fileId);
        if (!tf) break;
        const allReceived = tf.chunks.every(c => c !== null);
        if (allReceived) {
          const blobs = (tf.chunks as string[]).map(b64 => {
            const bin = atob(b64);
            return new Uint8Array(bin.length).map((_, i) => bin.charCodeAt(i));
          });
          const url = URL.createObjectURL(new Blob(blobs, { type: tf.mime }));
          this.emit({ type: 'file-progress', peerId: pid, fileId: msg.fileId, progress: 100, url });
        }
        conn.inFiles.delete(msg.fileId);
        break;
      }

      // ── Voice messages ─────────────────────────────────────────────────────
      case 'voice-meta': {
        conn.inVoice.set(msg.voiceId, {
          durationMs: msg.durationMs,
          chunks: new Array(msg.totalChunks).fill(null),
          received: 0,
        });
        this.emit({ type: 'message', msg: { id: msg.voiceId, peerId: pid, mine: false, voice: { durationMs: msg.durationMs, progress: 0, done: false }, ts: Date.now(), read: false } });
        break;
      }
      case 'voice-chunk': {
        const vf = conn.inVoice.get(msg.voiceId);
        if (!vf || vf.chunks[msg.index] !== null) break;
        vf.chunks[msg.index] = msg.data;
        vf.received++;
        const pct = Math.round((vf.received / vf.chunks.length) * 100);
        this.emit({ type: 'voice-progress', peerId: pid, voiceId: msg.voiceId, progress: pct });
        if (vf.received === vf.chunks.length) {
          const blobs = (vf.chunks as string[]).map(b64 => {
            const bin = atob(b64);
            return new Uint8Array(bin.length).map((_, i) => bin.charCodeAt(i));
          });
          const url = URL.createObjectURL(new Blob(blobs, { type: 'audio/webm;codecs=opus' }));
          this.emit({ type: 'voice-progress', peerId: pid, voiceId: msg.voiceId, progress: 100, url });
          conn.inVoice.delete(msg.voiceId);
        }
        break;
      }

      // ── Calls ─────────────────────────────────────────────────────────────
      case 'call-invite': {
        if (this.activeCall) { this.dc_send(conn, { type: 'call-busy', callId: msg.callId }); return; }
        this.activeCall = { callId: msg.callId, peerId: pid, peerName: msg.callerName, kind: msg.kind, state: 'ringing-in', muted: false, videoOff: false };
        this.emit({ type: 'call-updated', call: { ...this.activeCall } });
        break;
      }
      case 'call-answer': {
        if (!this.activeCall || this.activeCall.callId !== msg.callId) return;
        if (this.ringTimer) { clearTimeout(this.ringTimer); this.ringTimer = null; }
        if (msg.accepted) {
          this.activeCall = { ...this.activeCall, state: 'active', startedAt: Date.now() };
          this.emit({ type: 'call-updated', call: { ...this.activeCall } });
        } else {
          this.activeCall.localStream?.getTracks().forEach(t => t.stop());
          this.emit({ type: 'call-ended', callId: msg.callId, reason: 'declined' });
          this.activeCall = null;
        }
        break;
      }
      case 'call-end': {
        if (this.activeCall?.callId === msg.callId) {
          this.activeCall.localStream?.getTracks().forEach(t => t.stop());
          this.emit({ type: 'call-ended', callId: msg.callId, reason: msg.reason });
          this.activeCall = null;
        }
        break;
      }
      case 'call-busy': {
        if (this.activeCall?.callId === msg.callId) {
          this.activeCall.localStream?.getTracks().forEach(t => t.stop());
          this.emit({ type: 'call-ended', callId: msg.callId, reason: 'busy' });
          this.activeCall = null;
        }
        break;
      }

      // ── Group messages ─────────────────────────────────────────────────────
      case 'group-msg': {
        this.emit({ type: 'group-message', roomId: msg.roomId, msg: { id: msg.msgId, peerId: msg.senderId, mine: false, text: msg.text, ts: msg.ts, read: false } });
        break;
      }
    }
  }

  private removeConn(id: string) {
    const conn = this.peers.get(id);
    if (!conn) return;
    if (conn.pingTimer) clearInterval(conn.pingTimer);
    try { conn.pc.close(); } catch {}
    this.peers.delete(id);
    this.emit({ type: 'peer-removed', peerId: id });
  }

  // ── Utilities ─────────────────────────────────────────────────────────────
  private requireOpen(peerId: string): PeerConn {
    const c = this.peers.get(peerId);
    if (!c?.dc || c.dc.readyState !== 'open') throw new Error(`Peer ${peerId} not connected`);
    return c;
  }

  private peerInfoToRemote(p: { id: string; name: string; ts: number }): RemotePeer {
    const existing = this.peers.get(p.id);
    return existing?.info ?? { id: p.id, name: p.name, initials: initials(p.name), pingMs: null, connected: false, lastSeen: p.ts };
  }

  private ab2b64(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  private fmtSpeed(bps: number): string {
    if (!isFinite(bps) || bps <= 0) return '—';
    if (bps >= 1e9) return `${(bps / 1e9).toFixed(1)} GB/s`;
    if (bps >= 1e6) return `${(bps / 1e6).toFixed(1)} MB/s`;
    if (bps >= 1e3) return `${(bps / 1e3).toFixed(0)} KB/s`;
    return `${bps.toFixed(0)} B/s`;
  }

  private fmtETA(secs: number): string {
    if (!isFinite(secs) || secs < 0) return '—';
    if (secs < 5)  return 'almost done';
    if (secs < 60) return `${Math.ceil(secs)}s`;
    if (secs < 3600) return `${Math.ceil(secs / 60)}m`;
    return `${(secs / 3600).toFixed(1)}h`;
  }

  private urlB64ToUint8(base64: string): Uint8Array {
    const pad = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
    const raw = atob(pad.replace(/-/g, '+').replace(/_/g, '/'));
    return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
  }
}
