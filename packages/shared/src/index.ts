// ─── @nexus/shared — single source of truth ──────────────────────────────────

// ── Anime names ───────────────────────────────────────────────────────────────
export const ANIME_NAMES = [
  'Naruto','Sasuke','Sakura','Kakashi','Itachi','Hinata','Gaara','Rock Lee',
  'Goku','Vegeta','Gohan','Piccolo','Bulma','Krillin','Frieza','Cell',
  'Luffy','Zoro','Nami','Sanji','Usopp','Robin','Chopper','Franky','Ace',
  'Ichigo','Rukia','Orihime','Renji','Byakuya','Urahara','Yoruichi','Grimmjow',
  'Edward','Alphonse','Winry','Roy Mustang','Riza','Scar','Envy','Lust',
  'Gon','Killua','Kurapika','Leorio','Hisoka','Netero','Neferpitou','Illumi',
  'Natsu','Lucy','Gray','Erza','Happy','Wendy','Makarov','Laxus','Jellal',
  'Levi','Eren','Mikasa','Armin','Hange','Erwin','Historia','Reiner','Sasha',
  'Deku','Bakugo','Todoroki','Ochaco','Iida','All Might','Endeavor','Aizawa',
  'Tanjiro','Nezuko','Zenitsu','Inosuke','Giyu','Shinobu','Rengoku','Muzan',
  'Spike','Faye','Jet','Ein','Radical Ed',
  'Asuna','Kirito','Klein','Agil','Sinon','Leafa',
  'Rem','Ram','Emilia','Subaru','Beatrice','Roswaal','Felix',
  'Senku','Taiju','Chrome','Kohaku','Gen','Tsukasa',
  'Rimuru','Milim','Shion','Benimaru','Gobta','Ranga',
  'Megumi','Nobara','Yuji','Gojo','Nanami','Sukuna',
  'Denji','Power','Aki','Makima','Kishibe',
  'Zoro','Nami','Law','Hancock','Shanks','Whitebeard',
] as const;

export function randomAnimeName(): string {
  return ANIME_NAMES[Math.floor(Math.random() * ANIME_NAMES.length)];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), u.length - 1);
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${u[i]}`;
}

export function formatTime(date: Date = new Date()): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDuration(ms: number): string {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

// ── Signaling protocol ────────────────────────────────────────────────────────
export interface SignalingMessage {
  type:
    | 'register' | 'offer' | 'answer' | 'ice-candidate'
    | 'heartbeat' | 'peer-list' | 'peer-joined' | 'peer-left'
    | 'push-subscribe' | 'push-unsubscribe' | 'push-notify'
    | 'room-create' | 'room-join' | 'room-leave' | 'room-list'
    | 'room-info' | 'room-members' | 'room-joined' | 'room-left'
    | 'vapid-key' | 'error';
  from?:   string;
  to?:     string;
  roomId?: string;
  payload?: unknown;
}

export interface PeerInfo  { id: string; name: string; ts: number }
export interface RoomInfo  { id: string; name: string; members: PeerInfo[]; createdBy: string; createdAt: number }

// ── DataChannel protocol ──────────────────────────────────────────────────────
export interface HelloMsg      { type: 'hello';        name: string; version: string }
export interface ChatMsg       { type: 'chat';         text: string; ts: number; msgId: string; replyTo?: { id: string; senderName: string; text: string } }
export interface TypingMsg     { type: 'typing' }
export interface ReadMsg       { type: 'read';         msgId: string }
export interface PingMsg       { type: 'ping';         ts: number }
export interface PongMsg       { type: 'pong';         ts: number }
export interface FileMeta      { type: 'file-meta';    fileId: string; name: string; size: number; mime: string; totalChunks: number; chunkSize: number; batchId?: string }
export interface FileChunk     { type: 'file-chunk';   fileId: string; index: number; data: string; total: number }
export interface FileDone      { type: 'file-done';    fileId: string }
export interface BatchMetaMsg    { type: 'batch-meta';    batchId: string; totalFiles: number; totalSize: number }
export interface BatchProgressMsg { type: 'batch-progress'; batchId: string; downloadedCount: number }
export interface VoiceMeta     { type: 'voice-meta';   voiceId: string; durationMs: number; size: number; totalChunks: number }
export interface VoiceChunk    { type: 'voice-chunk';  voiceId: string; index: number; data: string; total: number }
export interface CallInvite    { type: 'call-invite';  callId: string; kind: CallKind; callerName: string }
export interface CallAnswer    { type: 'call-answer';  callId: string; accepted: boolean }
export interface CallEnd       { type: 'call-end';     callId: string; reason?: string }
export interface CallBusy      { type: 'call-busy';    callId: string }
export interface GroupMsg      { type: 'group-msg';    roomId: string; text: string; ts: number; msgId: string; senderName: string; senderId: string }
export interface GroupCallInvite { type: 'group-call-invite'; roomId: string; callerId: string; callerName: string }
export interface GroupCallJoin   { type: 'group-call-join';   roomId: string; joinerId: string }
export interface GroupCallLeave  { type: 'group-call-leave';  roomId: string; leaverId: string }
export interface ReactionMsg     { type: 'reaction';          msgId: string; emoji: string }
export interface GroupInviteMsg  { type: 'group-invite';      roomId: string; roomName: string }

export interface FileOffsetMsg    { type: 'file-offset';  fileId: string; offset: number }
export interface AllowFileMsg     { type: 'allow-file';   fileId: string }

export type DataMsg =
  | HelloMsg | ChatMsg | TypingMsg | ReadMsg
  | PingMsg  | PongMsg
  | FileMeta | FileChunk | FileDone | FileOffsetMsg | AllowFileMsg | BatchMetaMsg | BatchProgressMsg
  | VoiceMeta | VoiceChunk
  | CallInvite | CallAnswer | CallEnd | CallBusy
  | GroupMsg
  | GroupCallInvite | GroupCallJoin | GroupCallLeave
  | ReactionMsg
  | GroupInviteMsg;

// ── Push payload ──────────────────────────────────────────────────────────────
export interface PushPayload {
  type:      'message' | 'call' | 'file' | 'voice' | 'group-message';
  title:     string;
  body:      string;
  fromId:    string;
  fromName:  string;
  callId?:   string;
  callKind?: CallKind;
  roomId?:   string;
  url?:      string;
  icon?:     string;
}

// ── Types ─────────────────────────────────────────────────────────────────────
export type CallKind = 'voice' | 'video';

// ── Constants ─────────────────────────────────────────────────────────────────
export const CHUNK_SIZE       = 16 * 1024;            // 16 KB per file chunk (safest standard for cross-browser WebRTC limits)
export const VOICE_CHUNK      = 32  * 1024;            // 32 KB per voice chunk
export const MAX_FILE_SIZE    = 200 * 1024 * 1024 * 1024; // 200 GB
export const PROTOCOL_VERSION = '2.0.0';
export const HEARTBEAT_MS     = 10_000;
export const PEER_TIMEOUT_MS  = 120_000;
export const RING_TIMEOUT_MS  = 45_000;
export const MAX_MESH_PEERS   = 8;

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302'        },
  { urls: 'stun:stun1.l.google.com:19302'       },
  { urls: 'stun:global.stun.twilio.com:3478'    },
  { urls: 'stun:stun.nextcloud.com:443'         },
  // 🌐 High-availability free public TURN relays provided by Metered.ca
  { 
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turns:openrelay.metered.ca:443'
    ],
    username: 'openrelay',
    credential: 'openrelay'
  }
];
