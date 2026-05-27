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
import { WebRTCManager, deterministicId } from '@/lib/webrtc-manager';
import type { RemotePeer, LocalMessage, ActiveCall, GroupRoom } from '@/lib/webrtc-manager';
import { nanoid } from 'nanoid';
import {
  playSentSound,
  playReceivedSound,
  playConnectedSound,
  startCallRinging,
  stopCallRinging
} from '@/lib/sounds';
import { toast } from 'sonner';

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

  // Settings
  soundsEnabled: boolean;
  privacyMode:   boolean;

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
  sendMessage:      (peerId: string, text: string, replyTo?: { id: string; senderName: string; text: string }) => void;
  sendFile:         (peerId: string, filesOrFile: File | File[]) => Promise<void>;
  sendVoiceMsg:     (peerId: string, blob: Blob, durationMs: number) => Promise<void>;
  sendTyping:       (peerId: string) => void;
  sendReaction:     (peerId: string, msgId: string, emoji: string) => void;
  markRead:         (peerId: string) => void;
  markGroupRead:    (roomId: string) => void;
  connectToPeer:    (id: string) => void;
  startCall:        (peerId: string, kind: 'voice' | 'video') => Promise<void>;
  answerCall:       (callId: string, accepted: boolean) => Promise<void>;
  endCall:          (reason?: string) => void;
  toggleMute:       () => boolean;
  toggleVideo:      () => boolean;
  createRoom:       (name: string, inviteeIds?: string[]) => void;
  joinRoom:         (id: string) => void;
  leaveRoom:        (id: string) => void;
  sendGroupMessage: (roomId: string, text: string) => void;
  enablePush:       () => Promise<boolean>;
  toggleSounds:     () => void;
  togglePrivacy:    () => void;
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
        soundsEnabled: true, privacyMode: false,
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
              case 'peer-updated': {
                const prev = get().peers[ev.peer.id];
                const becomesConnected = (!prev || !prev.connected) && ev.peer.connected;
                set(s => { s.peers[ev.peer.id] = ev.peer; });
                if (becomesConnected && get().soundsEnabled) {
                  playConnectedSound();
                }
                break;
              }
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
                if (!msg.mine && get().soundsEnabled) {
                  playReceivedSound();
                }
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
              case 'reaction': {
                const { peerId, msgId, emoji } = ev;
                set(s => {
                  const thread = s.threads[peerId];
                  if (thread) {
                    const msg = thread.find(m => m.id === msgId);
                    if (msg) {
                      if (!msg.reactions) (msg as any).reactions = [];
                      const exists = (msg as any).reactions.includes(emoji);
                      if (exists) {
                        (msg as any).reactions = (msg as any).reactions.filter((e: any) => e !== emoji);
                      } else {
                        (msg as any).reactions.push(emoji);
                      }
                    }
                  }
                });
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

              case 'batch-progress':
                set(s => {
                  const t = s.threads[ev.peerId];
                  const m2 = t?.find(m => m.id === ev.batchId);
                  if (m2?.batch) {
                    if (ev.downloadedCount === -1) {
                      m2.batch.activeFileName = ev.activeFileName;
                      m2.batch.activeProgress = 0;
                    } else if (ev.downloadedCount === -2) {
                      m2.batch.activeProgress = ev.activeProgress;
                      if (ev.speed) m2.batch.speed = ev.speed;
                      if (ev.eta) m2.batch.eta = ev.eta;
                    } else if (ev.downloadedCount === -3) {
                      m2.batch.activeProgress = 100;
                      m2.batch.downloadedCount += 1;
                      if (m2.batch.downloadedCount >= m2.batch.totalFiles) {
                        m2.batch.done = true;
                      }
                    } else if (ev.downloadedCount >= 0) {
                      m2.batch.uploadedCount = ev.downloadedCount;
                      if (m2.batch.uploadedCount >= m2.batch.totalFiles && m2.batch.downloadedCount >= m2.batch.totalFiles) {
                        m2.batch.done = true;
                      }
                    }
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
                if (ev.call.state === 'ringing-in') {
                  if (get().soundsEnabled) startCallRinging();
                  if (Notification?.permission === 'granted') {
                    new Notification(`📞 Incoming ${ev.call.kind} call`, {
                      body: `${ev.call.peerName} is calling you`,
                      icon: '/icon-192.png', tag: 'call', requireInteraction: true,
                    });
                  }
                } else if (ev.call.state === 'active') {
                  stopCallRinging();
                  set(s => { s.stats.callsTotal++; });
                } else {
                  stopCallRinging();
                }
                break;

              case 'call-ended':
                set(s => { s.activeCall = null; });
                stopCallRinging();
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
              case 'group-invite-received':
                toast.success(`You were added to group "${ev.roomName}"! 🎉`, {
                  description: "Open the Groups tab to see the chat."
                });
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
        sendMessage(peerId, text, replyTo) {
          const m = get().manager;
          if (!m) return;
          try {
            const msgId = m.sendChat(peerId, text, replyTo);
            set(s => {
              if (!s.threads[peerId]) s.threads[peerId] = [];
              s.threads[peerId].push({ id: msgId, peerId, mine: true, text, ts: Date.now(), read: true, replyTo });
              s.stats.msgsSent++;
            });
            if (get().soundsEnabled) playSentSound();
          } catch (e) { console.error('[store] sendMessage', e); }
        },

        async sendFile(peerId, filesOrFile) {
          const m = get().manager;
          if (!m) return;

          const isBatch = Array.isArray(filesOrFile);
          if (!isBatch) {
            const file = filesOrFile;
            const fileId = deterministicId(`${file.name}_${file.size}_${file.lastModified}`);
            set(s => {
              if (!s.threads[peerId]) s.threads[peerId] = [];
              const existing = s.threads[peerId].find(m => m.id === fileId);
              if (!existing) {
                s.threads[peerId].push({ id: fileId, peerId, mine: true, file: { name: file.name, size: file.size, mime: file.type, progress: 0, done: false }, ts: Date.now(), read: true });
              } else if (existing.file) {
                existing.file.progress = 0;
                existing.file.done = false;
              }
            });
            try {
              await m.sendFile(peerId, file, (pct, speed, eta) => {
                set(s => {
                  const m2 = s.threads[peerId]?.find(m => m.id === fileId);
                  if (m2?.file) { m2.file.progress = pct; m2.file.speed = speed; m2.file.done = pct === 100; }
                });
              });
              set(s => { s.stats.filesShared++; s.stats.bytesShared += file.size; });
              if (get().soundsEnabled) playSentSound();
            } catch (e) { console.error('[store] sendFile', e); }
          } else {
            const files = filesOrFile;
            const batchId = nanoid();
            const totalSize = files.reduce((acc, f) => acc + f.size, 0);

            // Add batch message
            set(s => {
              if (!s.threads[peerId]) s.threads[peerId] = [];
              s.threads[peerId].push({
                id: batchId,
                peerId,
                mine: true,
                batch: {
                  id: batchId,
                  totalFiles: files.length,
                  uploadedCount: 0,
                  downloadedCount: 0,
                  activeFileName: files[0]?.name ?? '',
                  activeProgress: 0,
                  done: false
                },
                ts: Date.now(),
                read: true
              });
            });

            // Send batch-meta to the peer
            const conn = m.peers.get(peerId);
            if (conn) {
              m.dc_send(conn, {
                type: 'batch-meta',
                batchId,
                totalFiles: files.length,
                totalSize
              });
            }

            // Loop and send each file sequentially
            try {
              for (let i = 0; i < files.length; i++) {
                const file = files[i];
                
                // Update currently sending file name
                set(s => {
                  const m2 = s.threads[peerId]?.find(m => m.id === batchId);
                  if (m2?.batch) {
                    m2.batch.activeFileName = file.name;
                    m2.batch.activeProgress = 0;
                  }
                });

                await m.sendFile(peerId, file, (pct, speed, eta) => {
                  set(s => {
                    const m2 = s.threads[peerId]?.find(m => m.id === batchId);
                    if (m2?.batch) {
                      m2.batch.activeProgress = pct;
                      m2.batch.speed = speed;
                      m2.batch.eta = eta;
                    }
                  });
                }, batchId);

                // Increment uploaded count
                set(s => {
                  const m2 = s.threads[peerId]?.find(m => m.id === batchId);
                  if (m2?.batch) {
                    m2.batch.uploadedCount = i + 1;
                    if (i === files.length - 1) {
                      m2.batch.done = true;
                    }
                  }
                  s.stats.filesShared++;
                  s.stats.bytesShared += file.size;
                });

                // Notify receiver about uploaded count
                if (conn) {
                  m.dc_send(conn, {
                    type: 'batch-progress',
                    batchId,
                    downloadedCount: i + 1
                  });
                }
              }

              if (get().soundsEnabled) playSentSound();
            } catch (e) {
              console.error('[store] sendFile batch', e);
            }
          }
        },

        async sendVoiceMsg(peerId, blob, durationMs) {
          const m = get().manager;
          if (!m) return;
          const voiceId = nanoid();
          set(s => {
            if (!s.threads[peerId]) s.threads[peerId] = [];
            s.threads[peerId].push({ id: voiceId, peerId, mine: true, voice: { durationMs, progress: 100, done: true }, ts: Date.now(), read: true });
          });
          try {
            await m.sendVoiceMessage(peerId, blob, durationMs);
            if (get().soundsEnabled) playSentSound();
          }
          catch (e) { console.error('[store] sendVoiceMsg', e); }
        },

        sendTyping(peerId) { get().manager?.sendTyping(peerId); },
        sendReaction(peerId, msgId, emoji) {
          const m = get().manager;
          if (m) {
            m.sendReaction(peerId, msgId, emoji);
            set(s => {
              const thread = s.threads[peerId];
              if (thread) {
                const msg = thread.find(m2 => m2.id === msgId);
                if (msg) {
                  if (!msg.reactions) msg.reactions = [];
                  const exists = msg.reactions.includes(emoji);
                  if (exists) {
                    msg.reactions = msg.reactions.filter(e => e !== emoji);
                  } else {
                    msg.reactions.push(emoji);
                  }
                }
              }
            });
          }
        },
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
        createRoom(name, inviteeIds) { get().manager?.createRoom(name, inviteeIds); },
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

        toggleSounds() { set(s => { s.soundsEnabled = !s.soundsEnabled; }); },
        togglePrivacy() { set(s => { s.privacyMode = !s.privacyMode; }); },
      }),
      {
        name: 'nexus-v2',
        partialize: (s): Partial<State> => ({
          myName:        s.myName,
          pushEnabled:   s.pushEnabled,
          soundsEnabled: s.soundsEnabled,
          privacyMode:   s.privacyMode,
          stats:         s.stats,
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
