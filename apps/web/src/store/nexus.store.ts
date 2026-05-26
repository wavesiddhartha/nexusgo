/**
 * NEXUS global store v2
 * ──────────────────────
 * Single source of truth. All WebRTCManager events flow in here.
 * React components subscribe and re-render on change.
 */
'use client';

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';
import { WebRTCManager } from '@/lib/webrtc-manager';
import type { RemotePeer, LocalMessage, ActiveCall, GroupRoom } from '@/lib/webrtc-manager';
import { nanoid } from 'nanoid';

export type Screen = 'discover' | 'peers' | 'chat' | 'groups' | 'profile';

// ── State ─────────────────────────────────────────────────────────────────────
interface State {
  // Core
  manager:       WebRTCManager | null;
  wsConnected:   boolean;
  myId:          string;
  myName:        string;

  // 1:1
  peers:         Record<string, RemotePeer>;
  threads:       Record<string, LocalMessage[]>;   // peerId → messages
  unread:        Record<string, number>;
  activePeerId:  string | null;

  // Groups
  rooms:         Record<string, GroupRoom>;
  groupThreads:  Record<string, LocalMessage[]>;   // roomId → messages
  groupUnread:   Record<string, number>;
  activeRoomId:  string | null;

  // Calls
  activeCall:    ActiveCall | null;

  // Push
  pushEnabled:   boolean;

  // UI
  activeScreen:  Screen;
  selectedPeerId: string | null;

  // Stats
  stats: { msgsSent: number; filesShared: number; bytesShared: number; callsTotal: number };
}

// ── Actions ───────────────────────────────────────────────────────────────────
interface Actions {
  initManager:      (url: string) => void;
  setName:          (name: string) => void;
  setScreen:        (s: Screen) => void;
  setActivePeer:    (id: string | null) => void;
  setSelectedPeer:  (id: string | null) => void;
  setActiveRoom:    (id: string | null) => void;
  sendMessage:      (peerId: string, text: string) => void;
  sendFile:         (peerId: string, file: File) => Promise<void>;
  sendVoiceMsg:     (peerId: string, blob: Blob, durationMs: number) => Promise<void>;
  sendTyping:       (peerId: string) => void;
  markRead:         (peerId: string) => void;
  markGroupRead:    (roomId: string) => void;
  connectToPeer:    (id: string) => void;
  startCall:        (peerId: string, kind: 'voice' | 'video') => Promise<void>;
  answerCall:       (callId: string, accepted: boolean) => Promise<void>;
  endCall:          (reason?: string) => void;
  toggleMute:       () => boolean;
  toggleVideo:      () => boolean;
  createRoom:       (name: string) => void;
  joinRoom:         (id: string) => void;
  leaveRoom:        (id: string) => void;
  sendGroupMessage: (roomId: string, text: string) => void;
  enablePush:       () => Promise<boolean>;
}

type NexusState = State & Actions;

// ── Store ─────────────────────────────────────────────────────────────────────
export const useNexusStore = create<NexusState>()(
  immer(
    persist(
      (set, get) => ({
        // State defaults
        manager: null, wsConnected: false, myId: '', myName: '',
        peers: {}, threads: {}, unread: {}, activePeerId: null,
        rooms: {}, groupThreads: {}, groupUnread: {}, activeRoomId: null,
        activeCall: null, pushEnabled: false,
        activeScreen: 'discover', selectedPeerId: null,
        stats: { msgsSent: 0, filesShared: 0, bytesShared: 0, callsTotal: 0 },

        // ── Init ────────────────────────────────────────────────────────────
        initManager(url) {
          const existing = get().manager;
          if (existing) existing.disconnect();

          const m = new WebRTCManager(url);

          const unsub = m.on(ev => {
            switch (ev.type) {

              case 'ws-connected':
                set(s => { s.wsConnected = true; s.myId = m.myId; s.myName = m.myName; });
                break;
              case 'ws-disconnected':
                set(s => { s.wsConnected = false; });
                break;

              case 'peer-added':
              case 'peer-updated':
                set(s => { s.peers[ev.peer.id] = ev.peer; });
                break;
              case 'peer-removed':
                set(s => { delete s.peers[ev.peerId]; });
                break;

              case 'message': {
                const { msg } = ev;
                set(s => {
                  if (!s.threads[msg.peerId]) s.threads[msg.peerId] = [];
                  if (!s.threads[msg.peerId].some(m2 => m2.id === msg.id))
                    s.threads[msg.peerId].push(msg);
                  if (!msg.mine && s.activePeerId !== msg.peerId)
                    s.unread[msg.peerId] = (s.unread[msg.peerId] ?? 0) + 1;
                });
                // In-page notification when tab is backgrounded
                if (!msg.mine && typeof document !== 'undefined' && !document.hasFocus()) {
                  const peer = get().peers[msg.peerId];
                  const body = msg.file ? `📎 ${msg.file.name}` : msg.voice ? '🎙️ Voice message' : (msg.text ?? '');
                  if (Notification?.permission === 'granted') {
                    new Notification(peer?.name ?? 'NEXUS', { body, icon: '/icon-192.png', tag: msg.peerId });
                  }
                }
                break;
              }

              case 'file-progress':
                set(s => {
                  const t = s.threads[ev.peerId];
                  const m2 = t?.find(m => m.id === ev.fileId);
                  if (m2?.file) {
                    m2.file.progress = ev.progress;
                    m2.file.done     = ev.progress === 100;
                    if (ev.url)   m2.file.url   = ev.url;
                    if (ev.speed) m2.file.speed = ev.speed;
                    if (ev.eta)   m2.file.eta   = ev.eta;
                  }
                });
                break;

              case 'voice-progress':
                set(s => {
                  const t  = s.threads[ev.peerId];
                  const m2 = t?.find(m => m.id === ev.voiceId);
                  if (m2?.voice) {
                    m2.voice.progress = ev.progress;
                    m2.voice.done     = ev.progress === 100;
                    if (ev.url) m2.voice.url = ev.url;
                  }
                });
                break;

              case 'call-updated':
                set(s => { s.activeCall = ev.call; });
                if (ev.call.state === 'ringing-in' && Notification?.permission === 'granted') {
                  new Notification(`📞 Incoming ${ev.call.kind} call`, {
                    body: `${ev.call.peerName} is calling you`,
                    icon: '/icon-192.png', tag: 'call', requireInteraction: true,
                  });
                }
                if (ev.call.state === 'active') set(s => { s.stats.callsTotal++; });
                break;

              case 'call-ended':
                set(s => { s.activeCall = null; });
                break;

              case 'group-message': {
                const { roomId, msg } = ev;
                set(s => {
                  if (!s.groupThreads[roomId]) s.groupThreads[roomId] = [];
                  if (!s.groupThreads[roomId].some(m2 => m2.id === msg.id))
                    s.groupThreads[roomId].push(msg);
                  if (!msg.mine && s.activeRoomId !== roomId)
                    s.groupUnread[roomId] = (s.groupUnread[roomId] ?? 0) + 1;
                });
                break;
              }

              case 'room-updated':
                set(s => { s.rooms[ev.room.id] = ev.room; });
                break;
              case 'room-removed':
                set(s => { delete s.rooms[ev.roomId]; });
                break;
            }
          });

          m.connect();
          // store unsub for cleanup if needed
          set(s => { s.manager = m as any; s.myId = m.myId; s.myName = m.myName; });
        },

        // ── Identity ─────────────────────────────────────────────────────────
        setName(name) {
          get().manager?.setName(name);
          set(s => { s.myName = name; });
        },

        // ── Navigation ───────────────────────────────────────────────────────
        setScreen(screen) { set(s => { s.activeScreen = screen; }); },

        setActivePeer(id) {
          set(s => { s.activePeerId = id; if (id) s.unread[id] = 0; });
        },

        setSelectedPeer(id) { set(s => { s.selectedPeerId = id; }); },

        setActiveRoom(id) {
          set(s => { s.activeRoomId = id; if (id) s.groupUnread[id] = 0; });
        },

        // ── Messaging ────────────────────────────────────────────────────────
        sendMessage(peerId, text) {
          const m = get().manager;
          if (!m) return;
          try {
            const msgId = m.sendChat(peerId, text);
            set(s => {
              if (!s.threads[peerId]) s.threads[peerId] = [];
              s.threads[peerId].push({ id: msgId, peerId, mine: true, text, ts: Date.now(), read: true });
              s.stats.msgsSent++;
            });
          } catch (e) { console.error('[store] sendMessage', e); }
        },

        async sendFile(peerId, file) {
          const m = get().manager;
          if (!m) return;
          const fileId = nanoid();
          set(s => {
            if (!s.threads[peerId]) s.threads[peerId] = [];
            s.threads[peerId].push({ id: fileId, peerId, mine: true, file: { name: file.name, size: file.size, mime: file.type, progress: 0, done: false }, ts: Date.now(), read: true });
          });
          try {
            await m.sendFile(peerId, file, (pct, speed, eta) => {
              set(s => {
                const m2 = s.threads[peerId]?.find(m => m.id === fileId);
                if (m2?.file) { m2.file.progress = pct; m2.file.speed = speed; m2.file.eta = eta; m2.file.done = pct === 100; }
              });
            });
            set(s => { s.stats.filesShared++; s.stats.bytesShared += file.size; });
          } catch (e) { console.error('[store] sendFile', e); }
        },

        async sendVoiceMsg(peerId, blob, durationMs) {
          const m = get().manager;
          if (!m) return;
          const voiceId = nanoid();
          set(s => {
            if (!s.threads[peerId]) s.threads[peerId] = [];
            s.threads[peerId].push({ id: voiceId, peerId, mine: true, voice: { durationMs, progress: 100, done: true }, ts: Date.now(), read: true });
          });
          try { await m.sendVoiceMessage(peerId, blob, durationMs); }
          catch (e) { console.error('[store] sendVoiceMsg', e); }
        },

        sendTyping(peerId) { get().manager?.sendTyping(peerId); },
        markRead(peerId)   { set(s => { s.unread[peerId] = 0; }); },
        markGroupRead(id)  { set(s => { s.groupUnread[id] = 0; }); },
        connectToPeer(id)  { get().manager?.connectToPeer(id); },

        // ── Calls ─────────────────────────────────────────────────────────────
        async startCall(peerId, kind) {
          try { await get().manager?.startCall(peerId, kind); }
          catch (e: any) { throw e; }
        },

        async answerCall(callId, accepted) {
          try { await get().manager?.answerCall(callId, accepted); }
          catch (e: any) { throw e; }
        },

        endCall(reason)  { get().manager?.endCall(reason); },
        toggleMute()     { return get().manager?.toggleMute() ?? false; },
        toggleVideo()    { return get().manager?.toggleVideo() ?? false; },

        // ── Groups ─────────────────────────────────────────────────────────────
        createRoom(name) { get().manager?.createRoom(name); },
        joinRoom(id)     { get().manager?.joinRoom(id); },
        leaveRoom(id)    { get().manager?.leaveRoom(id); },

        sendGroupMessage(roomId, text) {
          const m = get().manager;
          if (!m) return;
          try {
            const msgId = m.sendGroupMessage(roomId, text);
            const myId  = get().myId;
            set(s => {
              if (!s.groupThreads[roomId]) s.groupThreads[roomId] = [];
              s.groupThreads[roomId].push({ id: msgId, peerId: myId, mine: true, text, ts: Date.now(), read: true });
              s.stats.msgsSent++;
            });
          } catch (e) { console.error('[store] sendGroupMessage', e); }
        },

        // ── Push ──────────────────────────────────────────────────────────────
        async enablePush() {
          const m = get().manager;
          if (!m) return false;
          const granted = await m.requestNotificationPermission();
          if (!granted) return false;
          const ok = await m.subscribePush();
          set(s => { s.pushEnabled = ok; });
          return ok;
        },
      }),
      {
        name: 'nexus-v2',
        partialize: (s): Partial<State> => ({
          myName:      s.myName,
          pushEnabled: s.pushEnabled,
          stats:       s.stats,
        }),
      }
    )
  )
);

// ── Selectors ─────────────────────────────────────────────────────────────────
export const selectPeerList    = (s: NexusState) => Object.values(s.peers);
export const selectConnected   = (s: NexusState) => Object.values(s.peers).filter(p => p.connected).length;
export const selectUnread1to1  = (s: NexusState) => Object.values(s.unread).reduce((a, b) => a + b, 0);
export const selectUnreadGroup = (s: NexusState) => Object.values(s.groupUnread).reduce((a, b) => a + b, 0);
export const selectTotalUnread = (s: NexusState) => selectUnread1to1(s) + selectUnreadGroup(s);
export const selectThread      = (pid: string) => (s: NexusState) => s.threads[pid] ?? [];
export const selectGroupThread = (rid: string) => (s: NexusState) => s.groupThreads[rid] ?? [];
export const selectRoomList    = (s: NexusState) => Object.values(s.rooms);
