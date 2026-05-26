'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNexusStore, selectPeerList, selectThread } from '@/store/nexus.store';
import { useTypingIndicator, useTypingSender, useAutoscroll, useAutoResize } from '@/hooks';
import { VoiceRecorder } from '@/components/ui/VoiceRecorder';
import { VoiceBubble }   from '@/components/ui/VoiceBubble';
import { formatBytes, formatTime } from '@nexus/shared';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { LocalMessage } from '@/lib/webrtc-manager';

// ── File modal ─────────────────────────────────────────────────────────────────
function FileModal({ onClose, onSelect }: { onClose: () => void; onSelect: (f: File) => void }) {
  const options = [
    { label: 'Photo or Image', sub: 'JPEG · PNG · GIF · WebP',       accept: 'image/*',  icon: 'image' },
    { label: 'Video',          sub: 'MP4 · MOV · WebM',              accept: 'video/*',  icon: 'video' },
    { label: 'Any File',       sub: 'Up to 2 GB · direct P2P',       accept: undefined,  icon: 'file'  },
  ];

  const pick = (accept?: string) => {
    const el = document.createElement('input');
    el.type = 'file';
    if (accept) el.accept = accept;
    el.onchange = () => {
      const f = el.files?.[0];
      if (f) { onSelect(f); onClose(); }
    };
    el.click();
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.3)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-white w-full max-w-lg rounded-t-[24px] px-5 pt-5"
        style={{ paddingBottom: 'calc(20px + var(--safe-bottom))' }}
        initial={{ y: 90 }} animate={{ y: 0 }} exit={{ y: 90 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="w-9 h-[3px] bg-[#e4e4e0] rounded-full mx-auto mb-5" />
        <h3 className="text-[15px] font-medium text-black mb-4">Share a file</h3>
        <div className="flex flex-col gap-2">
          {options.map(({ label, sub, accept, icon }) => (
            <button
              key={label}
              onClick={() => pick(accept)}
              className="flex items-center gap-3.5 px-4 py-3.5 rounded-[14px] border border-[#ebebea] hover:border-[#b0b0a8] active:bg-[#f5f5f3] transition-all text-left"
            >
              <ShareIcon type={icon} />
              <div>
                <div className="text-[13px] font-medium text-black">{label}</div>
                <div className="text-[10px] font-mono font-light text-[#a0a09a] mt-0.5">{sub}</div>
              </div>
            </button>
          ))}
        </div>
        <button onClick={onClose} className="w-full text-center py-4 text-[12px] font-mono font-light text-[#a0a09a] hover:text-black transition-colors">
          Cancel
        </button>
      </motion.div>
    </motion.div>
  );
}

// ── Quote / Reference Box ───────────────────────────────────────────────────
function QuoteBox({ replyTo, mine }: { replyTo: { id: string; senderName: string; text: string }; mine: boolean }) {
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        const el = document.getElementById(`msg-${replyTo.id}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('bg-yellow-100/40', 'ring-2', 'ring-yellow-400/20');
          setTimeout(() => {
            el.classList.remove('bg-yellow-100/40', 'ring-2', 'ring-yellow-400/20');
          }, 1200);
        }
      }}
      className={cn(
        'mb-2 px-2.5 py-1.5 rounded-[12px] text-left border-l-2 text-[11px] cursor-pointer select-none truncate transition-all duration-200',
        mine
          ? 'bg-white/10 border-white/40 text-white/90 hover:bg-white/15'
          : 'bg-[#080808]/5 border-[#080808]/30 text-black/80 hover:bg-[#080808]/10'
      )}
      style={{ maxWidth: 200 }}
    >
      <div className="font-medium text-[9px] uppercase tracking-wider mb-0.5 opacity-90">
        {replyTo.senderName}
      </div>
      <div className="truncate text-[11px] font-light">
        {replyTo.text}
      </div>
    </div>
  );
}

// ── Reply Button ─────────────────────────────────────────────────────────────
function ReplyButton({ onReply }: { onReply: () => void }) {
  return (
    <button
      onClick={onReply}
      className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 w-7 h-7 rounded-full bg-[#f0f0ee] hover:bg-[#e0e0dc] active:scale-95 flex items-center justify-center shrink-0 border border-[#e4e4e0] cursor-pointer select-none"
      title="Reply"
    >
      <svg className="w-3.5 h-3.5 stroke-[#5a5a55]" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <polyline points="9 17 4 12 9 7"/>
        <path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
      </svg>
    </button>
  );
}

// ── Message bubble ─────────────────────────────────────────────────────────────
function Bubble({ msg, onReply }: { msg: LocalMessage; onReply: (msg: LocalMessage) => void }) {
  // Voice message
  if (msg.voice) {
    return (
      <div
        id={`msg-${msg.id}`}
        className={cn(
          'flex items-center gap-2 group max-w-[85%] select-text transition-all duration-300 rounded-[18px]',
          msg.mine ? 'self-end flex-row-reverse' : 'self-start flex-row'
        )}
      >
        <div className={cn('flex flex-col', msg.mine ? 'items-end' : 'items-start')}>
          <div className={cn(
            'px-3.5 py-2.5 rounded-[18px]',
            msg.mine ? 'bg-[#080808] text-white rounded-br-[5px]' : 'bg-[#f0f0ee] text-black rounded-bl-[5px]'
          )}>
            {msg.replyTo && <QuoteBox replyTo={msg.replyTo} mine={msg.mine} />}
            <VoiceBubble
              url={msg.voice.url}
              durationMs={msg.voice.durationMs}
              progress={msg.voice.progress}
              done={msg.voice.done}
              mine={msg.mine}
            />
          </div>
          <span className="text-[9px] font-mono font-light text-[#c8c8c2] mt-1.5 px-1">
            {formatTime(new Date(msg.ts))}
          </span>
        </div>
        <ReplyButton onReply={() => onReply(msg)} />
      </div>
    );
  }

  // File transfer
  if (msg.file) {
    const hasUrl   = !!msg.file.url;
    const isDone   = msg.file.done;
    return (
      <div
        id={`msg-${msg.id}`}
        className={cn(
          'flex items-center gap-2 group max-w-[85%] select-text transition-all duration-300 rounded-[18px]',
          msg.mine ? 'self-end flex-row-reverse' : 'self-start flex-row'
        )}
      >
        <div className={cn('flex flex-col', msg.mine ? 'items-end' : 'items-start')}>
          <div
            onClick={() => {
              if (hasUrl && msg.file?.url) {
                const a = document.createElement('a');
                a.href = msg.file.url;
                a.download = msg.file.name;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
              }
            }}
            className={cn(
              'rounded-[14px] p-3.5 transition-colors',
              hasUrl ? 'cursor-pointer' : 'cursor-default',
              msg.mine
                ? 'bg-[#f0f0ee] border border-[#e4e4e0] hover:border-[#b0b0a8]'
                : 'bg-white      border border-[#e8e8e4] hover:border-[#b0b0a8]'
            )}
            style={{ minWidth: 190, maxWidth: 240 }}
          >
            {msg.replyTo && <QuoteBox replyTo={msg.replyTo} mine={msg.mine} />}
            {/* File info */}
            <div className="flex items-start gap-2.5 mb-2.5">
              <div className="w-9 h-9 rounded-[9px] bg-[#f0f0ee] flex items-center justify-center border border-[#e4e4e0] shrink-0">
                <svg className="w-[15px] h-[15px] stroke-[#7a7a74]" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                  <polyline points="13 2 13 9 20 9"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium text-black truncate">{msg.file.name}</div>
                <div className="text-[10px] font-mono font-light text-[#a0a09a] mt-0.5">{formatBytes(msg.file.size)}</div>
              </div>
            </div>

            {/* Progress / status */}
            {!isDone ? (
              <>
                <div className="h-[2px] bg-[#ebebea] rounded-full overflow-hidden mb-1.5">
                  <motion.div
                    className="h-full bg-[#080808] rounded-full"
                    animate={{ width: `${msg.file.progress}%` }}
                    transition={{ duration: 0.2 }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-light text-[#a0a09a]">{msg.file.progress}%</span>
                  {(msg.file.speed || msg.file.eta) && (
                    <span className="text-[10px] font-mono font-light text-[#a0a09a]">
                      {msg.file.speed}{msg.file.eta ? ` · ${msg.file.eta}` : ''}
                    </span>
                  )}
                </div>
              </>
            ) : hasUrl ? (
              <div className="flex items-center gap-1.5">
                <svg className="w-3 h-3 stroke-[#3b82f6]" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                <span className="text-[10px] font-mono font-light text-[#3b82f6]">Download</span>
              </div>
            ) : (
              <span className="text-[10px] font-mono font-light text-[#22c55e]">Sent ✓</span>
            )}
          </div>
          <span className="text-[9px] font-mono font-light text-[#c8c8c2] mt-1.5 px-1">
            {formatTime(new Date(msg.ts))}
          </span>
        </div>
        <ReplyButton onReply={() => onReply(msg)} />
      </div>
    );
  }

  // Text message
  return (
    <div
      id={`msg-${msg.id}`}
      className={cn(
        'flex items-center gap-2 group max-w-[85%] select-text transition-all duration-300 rounded-[18px]',
        msg.mine ? 'self-end flex-row-reverse' : 'self-start flex-row'
      )}
    >
      <div className={cn('flex flex-col', msg.mine ? 'items-end' : 'items-start')}>
        <div className={cn(
          'px-3.5 py-2.5 text-[14px] leading-[1.55] break-words rounded-[18px]',
          msg.mine
            ? 'bg-[#080808] text-white rounded-br-[5px]'
            : 'bg-[#f0f0ee] text-black rounded-bl-[5px]'
        )}>
          {msg.replyTo && <QuoteBox replyTo={msg.replyTo} mine={msg.mine} />}
          {msg.text}
        </div>
        <span className="text-[9px] font-mono font-light text-[#c8c8c2] mt-1.5 px-1">
          {formatTime(new Date(msg.ts))}
        </span>
      </div>
      <ReplyButton onReply={() => onReply(msg)} />
    </div>
  );
}

// ── Peer list sidebar (md+ screens) ───────────────────────────────────────────
function PeerListSidebar({ activePeerId, onSelect }: { activePeerId: string | null; onSelect: (id: string) => void }) {
  const peers   = useNexusStore(selectPeerList);
  const unread  = useNexusStore(s => s.unread);
  const threads = useNexusStore(s => s.threads);

  return (
    <div className="w-[210px] border-r border-[#ebebea] hidden md:flex flex-col shrink-0 bg-white">
      <div className="px-4 py-3 border-b border-[#f0f0ee]">
        <span className="text-[9px] font-mono font-light text-[#b0b0a8] uppercase tracking-widest">Messages</span>
      </div>
      <div className="flex-1 overflow-y-auto scroll-touch">
        {peers.length === 0 && (
          <p className="text-center text-[10px] font-mono font-light text-[#c8c8c2] mt-8 px-4">No peers yet</p>
        )}
        {peers.map(p => {
          const th    = threads[p.id] ?? [];
          const last  = th[th.length - 1];
          const preview = last
            ? (last.voice ? '🎙 Voice message' : last.file ? `📎 ${last.file.name}` : last.text ?? '')
            : '';
          const active  = p.id === activePeerId;
          const badge   = unread[p.id] ?? 0;

          return (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={cn(
                'w-full flex items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-[#f8f8f7]',
                active && 'bg-[#f5f5f3]'
              )}
            >
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-medium shrink-0 transition-colors',
                active ? 'bg-[#080808] text-white' : 'bg-[#f0f0ee] text-[#5a5a55]'
              )}>
                {p.initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-black">{p.name}</div>
                <div className="text-[10px] font-mono font-light text-[#a0a09a] truncate mt-0.5">
                  {preview || 'No messages yet'}
                </div>
              </div>
              {badge > 0 && (
                <div className="w-[18px] h-[18px] rounded-full bg-[#080808] text-white text-[9px] font-medium flex items-center justify-center shrink-0">
                  {badge > 9 ? '9+' : badge}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main chat screen ───────────────────────────────────────────────────────────
export function ChatScreen() {
  const activePeerId  = useNexusStore(s => s.activePeerId);
  const setActivePeer = useNexusStore(s => s.setActivePeer);
  const setScreen     = useNexusStore(s => s.setScreen);
  const sendMessage   = useNexusStore(s => s.sendMessage);
  const sendFile      = useNexusStore(s => s.sendFile);
  const sendVoiceMsg  = useNexusStore(s => s.sendVoiceMsg);
  const startCall     = useNexusStore(s => s.startCall);
  const markRead      = useNexusStore(s => s.markRead);
  const peers         = useNexusStore(selectPeerList);
  const thread        = useNexusStore(selectThread(activePeerId ?? ''));
  const peer          = peers.find(p => p.id === activePeerId);

  const [text,       setText]      = useState('');
  const [showModal,  setShowModal] = useState(false);
  const [showVoice,  setShowVoice] = useState(false);
  const [replyTarget, setReplyTarget] = useState<LocalMessage | null>(null);
  const [showTrust,  setShowTrust]  = useState(false);

  const taRef         = useRef<HTMLTextAreaElement>(null);
  const msgRef        = useAutoscroll([thread.length, activePeerId]);
  const autoResize    = useAutoResize(taRef);
  const notifyTyping  = useTypingSender(activePeerId);
  const isTyping      = useTypingIndicator(activePeerId);

  useEffect(() => {
    if (activePeerId) markRead(activePeerId);
  }, [activePeerId, thread.length, markRead]);

  // ── Auto Reconnect ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (activePeerId && peer && !peer.connected) {
      const connectToPeer = useNexusStore.getState().connectToPeer;
      connectToPeer(activePeerId);
      const timer = setInterval(() => {
        const currentPeer = useNexusStore.getState().peers[activePeerId];
        if (currentPeer && !currentPeer.connected) {
          connectToPeer(activePeerId);
        }
      }, 5000);
      return () => clearInterval(timer);
    }
  }, [activePeerId, peer?.connected]);

  const handleSend = useCallback(() => {
    const v = text.trim();
    if (!v || !activePeerId) return;
    if (!peer?.connected) { toast.error('Peer not connected'); return; }
    
    let replyPayload = undefined;
    if (replyTarget) {
      replyPayload = {
        id: replyTarget.id,
        senderName: replyTarget.mine ? 'You' : (peer.name || 'Peer'),
        text: replyTarget.file ? `📎 ${replyTarget.file.name}` : replyTarget.voice ? '🎙️ Voice Message' : (replyTarget.text ?? ''),
      };
    }

    sendMessage(activePeerId, v, replyPayload);
    setText('');
    setReplyTarget(null);
    if (taRef.current) taRef.current.style.height = 'auto';
  }, [text, activePeerId, peer, sendMessage, replyTarget]);

  const handleFile = useCallback(async (file: File) => {
    if (!activePeerId || !peer?.connected) { toast.error('Peer not connected'); return; }
    try { await sendFile(activePeerId, file); }
    catch (e: any) { toast.error(e.message ?? 'Transfer failed'); }
  }, [activePeerId, peer, sendFile]);

  const handleVoice = useCallback(async (blob: Blob, durationMs: number) => {
    if (!activePeerId || !peer?.connected) { toast.error('Peer not connected'); return; }
    setShowVoice(false);
    await sendVoiceMsg(activePeerId, blob, durationMs);
  }, [activePeerId, peer, sendVoiceMsg]);

  const handleCall = useCallback(async (kind: 'voice' | 'video') => {
    if (!activePeerId || !peer?.connected) { toast.error('Peer not connected'); return; }
    try { await startCall(activePeerId, kind); }
    catch (e: any) { toast.error(e.message ?? 'Call failed'); }
  }, [activePeerId, peer, startCall]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (!activePeerId || !peer) {
    return (
      <div className="flex h-full">
        <PeerListSidebar activePeerId={null} onSelect={id => { setActivePeer(id); }} />
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <svg className="w-11 h-11 stroke-[#deded8]" fill="none" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <p className="text-[11px] font-mono font-light text-[#c0c0bc]">Select a peer to start chatting</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      <PeerListSidebar activePeerId={activePeerId} onSelect={id => setActivePeer(id)} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 h-[52px] border-b border-[#ebebea] shrink-0 bg-white">
          {/* Back (mobile) */}
          <button
            onClick={() => { setActivePeer(null); setScreen('peers'); }}
            className="w-8 h-8 rounded-[9px] flex items-center justify-center hover:bg-[#f5f5f3] active:bg-[#f0f0ee] transition-colors md:hidden shrink-0"
          >
            <svg className="w-4 h-4 stroke-black" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>

          {/* Avatar */}
          <div className="w-[34px] h-[34px] rounded-full bg-[#f0f0ee] flex items-center justify-center text-[11px] font-medium text-[#3a3a38] shrink-0">
            {peer.initials}
          </div>

          {/* Name + meta */}
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-medium text-black">{peer.name}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] font-mono font-light text-[#a0a09a]">
                WebRTC{peer.pingMs != null ? ` · ${peer.pingMs}ms` : ''}
              </span>
              <button
                onClick={() => setShowTrust(true)}
                className="flex items-center gap-0.5 bg-[#f0f0ee] border border-[#e4e4e0] px-1.5 py-0.5 rounded-[6px] hover:bg-[#e4e4e0] active:scale-95 transition-all cursor-pointer"
                title="End-to-End Encrypted via DTLS-SRTP"
              >
                <svg className="w-[8.5px] h-[8.5px] stroke-[#22c55e] fill-none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span className="text-[8.5px] font-mono text-[#22c55e] tracking-wider uppercase font-semibold">E2EE</span>
              </button>
            </div>
          </div>

          {/* Call buttons */}
          {peer.connected && (
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                onClick={() => handleCall('voice')}
                className="w-8 h-8 rounded-[9px] flex items-center justify-center hover:bg-[#f5f5f3] active:bg-[#f0f0ee] transition-colors"
                title="Voice call"
              >
                <svg className="w-[15px] h-[15px] stroke-[#5a5a55]" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
              </button>
              <button
                onClick={() => handleCall('video')}
                className="w-8 h-8 rounded-[9px] flex items-center justify-center hover:bg-[#f5f5f3] active:bg-[#f0f0ee] transition-colors"
                title="Video call"
              >
                <svg className="w-[15px] h-[15px] stroke-[#5a5a55]" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <polygon points="23 7 16 12 23 17 23 7"/>
                  <rect x="1" y="5" width="15" height="14" rx="2"/>
                </svg>
              </button>
            </div>
          )}

          {/* Online indicator */}
          <div className="flex items-center gap-1.5 shrink-0 select-none">
            <div className={cn('w-[5.5px] h-[5.5px] rounded-full', peer.connected ? 'bg-[#22c55e]' : 'bg-[#eab308] animate-pulse')} />
            <span className="text-[10px] font-mono font-light text-[#a0a09a]">
              {peer.connected ? 'online' : 'connecting…'}
            </span>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={msgRef}
          className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-2 scroll-touch"
          style={{ background: '#fefefe' }}
        >
          {thread.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-[11px] font-mono font-light text-[#d0d0cc]">No messages yet</p>
            </div>
          ) : (
            thread.map(msg => <Bubble key={msg.id} msg={msg} onReply={setReplyTarget} />)
          )}

          {/* Typing indicator */}
          <AnimatePresence>
            {isTyping && (
              <motion.div
                className="self-start"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
              >
                <div className="flex items-center gap-[5px] px-3.5 py-2.5 bg-[#f0f0ee] rounded-[18px] rounded-bl-[5px]">
                  {[0, 0.16, 0.32].map((d, i) => (
                    <div
                      key={i}
                      className="w-[5px] h-[5px] rounded-full bg-[#a0a09a]"
                      style={{ animation: `typing-bounce .85s ease-in-out ${d}s infinite` }}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Input bar */}
        <div
          className="border-t border-[#ebebea] px-4 py-2.5 shrink-0 bg-white"
          style={{ paddingBottom: 'calc(10px + var(--safe-bottom))' }}
        >
          {/* Reply Preview Card */}
          {replyTarget && (
            <div className="flex items-center justify-between bg-[#f5f5f3] border-l-4 border-[#080808] px-3.5 py-2 mb-2 rounded-r-[12px] animate-fadeIn select-none">
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-mono font-medium uppercase tracking-wider text-black">
                  Replying to {replyTarget.mine ? 'You' : peer.name}
                </span>
                <p className="text-[12px] text-[#5a5a55] truncate font-light mt-0.5">
                  {replyTarget.file ? `📎 ${replyTarget.file.name}` : replyTarget.voice ? '🎙️ Voice Message' : replyTarget.text}
                </p>
              </div>
              <button
                onClick={() => setReplyTarget(null)}
                className="w-5 h-5 rounded-full hover:bg-[#e4e4e0] flex items-center justify-center shrink-0 ml-2"
              >
                <svg className="w-3 h-3 stroke-[#5a5a55]" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          )}

          <AnimatePresence mode="wait">
            {showVoice ? (
              <motion.div key="voice" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <VoiceRecorder
                  onSend={handleVoice}
                  onCancel={() => setShowVoice(false)}
                />
              </motion.div>
            ) : (
              <motion.div key="text" className="flex items-end gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {/* Attach button */}
                <button
                  onClick={() => setShowModal(true)}
                  className="w-8 h-8 rounded-full border border-[#e4e4e0] flex items-center justify-center shrink-0 hover:border-[#a0a09a] active:border-black transition-colors duration-150 mb-[1px]"
                >
                  <svg className="w-[14px] h-[14px] stroke-[#8a8a84]" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                  </svg>
                </button>

                {/* Text + action button */}
                <div className="flex-1 flex items-end gap-2 bg-[#f5f5f3] rounded-[22px] px-4 py-[9px]">
                  <textarea
                    ref={taRef}
                    rows={1}
                    value={text}
                    className="flex-1 text-[14px] font-sans bg-transparent resize-none placeholder-[#c0c0bc] text-black leading-[1.4] max-h-[110px] scroll-touch"
                    style={{ border: 'none', outline: 'none', boxShadow: 'none' }}
                    placeholder="Message…"
                    onChange={e => { setText(e.target.value); autoResize(); notifyTyping(); }}
                    onKeyDown={handleKey}
                  />
                  {/* Send or mic */}
                  {text.trim() ? (
                    <button
                      onClick={handleSend}
                      className="w-7 h-7 rounded-full bg-[#080808] flex items-center justify-center shrink-0 active:scale-90 transition-transform duration-100 mb-[-1px]"
                    >
                      <svg className="w-[12px] h-[12px]" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                        <line x1="22" y1="2" x2="11" y2="13"/>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                      </svg>
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowVoice(true)}
                      className="w-7 h-7 rounded-full bg-[#ebebea] flex items-center justify-center shrink-0 active:scale-90 transition-transform duration-100 hover:bg-[#e0e0dc] mb-[-1px]"
                    >
                      <svg className="w-[13px] h-[13px] stroke-[#5a5a55]" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                        <line x1="12" y1="19" x2="12" y2="23"/>
                      </svg>
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* File modal */}
      <AnimatePresence>
        {showModal && <FileModal onClose={() => setShowModal(false)} onSelect={handleFile} />}
      </AnimatePresence>

      {/* E2E Trust Popup Modal */}
      <AnimatePresence>
        {showTrust && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.3)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowTrust(false)}
          >
            <motion.div
              className="bg-white border border-[#ebebea] rounded-[24px] p-6 max-w-sm w-full text-center relative shadow-2xl"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="w-12 h-12 rounded-full bg-[#f0f0ee] flex items-center justify-center mx-auto mb-4 border border-[#e4e4e0]">
                <svg className="w-5 h-5 stroke-black fill-none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <h4 className="text-[15px] font-medium text-black mb-2">100% Peer-to-Peer Encrypted</h4>
              <p className="text-[12px] font-mono font-light text-[#5a5a55] leading-relaxed mb-5">
                NEXUS establishes a direct WebRTC DataChannel connection between your devices. All messages, calls, and files are encrypted end-to-end via DTLS-SRTP. Zero data ever touches any cloud server.
              </p>
              <button
                onClick={() => setShowTrust(false)}
                className="w-full py-2.5 bg-[#080808] text-white rounded-[12px] text-[12px] font-medium active:scale-95 transition-transform cursor-pointer"
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Share icon helper ──────────────────────────────────────────────────────────
function ShareIcon({ type }: { type: string }) {
  const cls = 'w-[18px] h-[18px] stroke-[#7a7a74] shrink-0';
  const p = { fill: 'none', strokeWidth: '1.5', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className: cls, viewBox: '0 0 24 24' };
  switch (type) {
    case 'image': return <svg {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>;
    case 'video': return <svg {...p}><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>;
    case 'file':  return <svg {...p}><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>;
    default:      return null;
  }
}
