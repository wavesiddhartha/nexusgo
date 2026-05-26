'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNexusStore, selectRoomList, selectGroupThread } from '@/store/nexus.store';
import { useAutoscroll, useAutoResize } from '@/hooks';
import { formatTime } from '@nexus/shared';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { GroupRoom } from '@/lib/webrtc-manager';

// ── Create / Join modal ────────────────────────────────────────────────────────
function RoomModal({ onClose }: { onClose: () => void }) {
  const createRoom = useNexusStore(s => s.createRoom);
  const joinRoom   = useNexusStore(s => s.joinRoom);
  const [tab,  setTab]  = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [id,   setId]   = useState('');

  const doCreate = () => {
    if (!name.trim()) { toast.error('Enter a room name'); return; }
    createRoom(name.trim()); toast('Room created!'); onClose();
  };
  const doJoin = () => {
    if (!id.trim()) { toast.error('Enter a room ID'); return; }
    joinRoom(id.trim()); onClose();
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.28)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
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

        {/* Tabs */}
        <div className="flex bg-[#f5f5f3] rounded-[12px] p-1 mb-5">
          {(['create', 'join'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex-1 py-2 rounded-[9px] text-[12px] font-medium transition-all duration-150',
                tab === t ? 'bg-white text-black shadow-sm' : 'text-[#8a8a84]'
              )}
            >
              {t === 'create' ? 'Create Room' : 'Join by ID'}
            </button>
          ))}
        </div>

        {tab === 'create' ? (
          <div className="space-y-3">
            <input
              autoFocus value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doCreate()}
              placeholder='Room name  (e.g. "Study Group")'
              className="w-full px-4 py-3 rounded-[12px] border border-[#e4e4e0] text-[14px] font-sans bg-[#f9f9f8] placeholder-[#c0c0bc] text-black"
              style={{ outline: 'none' }}
            />
            <p className="text-[11px] font-mono font-light text-[#a0a09a] px-1">
              Anyone with the room ID can join. Up to 8 peers for group calls.
            </p>
            <button onClick={doCreate}
              className="w-full py-3.5 bg-[#080808] text-white rounded-[12px] text-[13px] font-medium active:opacity-70 transition-opacity">
              Create Room
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              autoFocus value={id} onChange={e => setId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doJoin()}
              placeholder="Paste room ID…"
              className="w-full px-4 py-3 rounded-[12px] border border-[#e4e4e0] text-[14px] font-mono font-light bg-[#f9f9f8] placeholder-[#c0c0bc] text-black"
              style={{ outline: 'none' }}
            />
            <button onClick={doJoin}
              className="w-full py-3.5 bg-[#080808] text-white rounded-[12px] text-[13px] font-medium active:opacity-70 transition-opacity">
              Join Room
            </button>
          </div>
        )}

        <button onClick={onClose}
          className="w-full text-center py-4 text-[12px] font-mono font-light text-[#a0a09a] hover:text-black transition-colors">
          Cancel
        </button>
      </motion.div>
    </motion.div>
  );
}

// ── Group chat ─────────────────────────────────────────────────────────────────
function GroupChat({ room, onBack }: { room: GroupRoom; onBack: () => void }) {
  const myId          = useNexusStore(s => s.myId);
  const sendGroupMsg  = useNexusStore(s => s.sendGroupMessage);
  const leaveRoom     = useNexusStore(s => s.leaveRoom);
  const thread        = useNexusStore(selectGroupThread(room.id));

  const [text,         setText]         = useState('');
  const [showMembers,  setShowMembers]  = useState(false);
  const taRef     = useRef<HTMLTextAreaElement>(null);
  const msgRef    = useAutoscroll([thread.length]);
  const autoResize = useAutoResize(taRef);

  const send = useCallback(() => {
    const v = text.trim();
    if (!v) return;
    sendGroupMsg(room.id, v);
    setText('');
    if (taRef.current) taRef.current.style.height = 'auto';
  }, [text, room.id, sendGroupMsg]);

  const copyId = () => {
    navigator.clipboard.writeText(room.id).then(() => toast('Room ID copied!')).catch(() => {});
  };

  const handleLeave = () => {
    leaveRoom(room.id);
    onBack();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 h-[52px] border-b border-[#ebebea] shrink-0 bg-white">
        <button onClick={onBack}
          className="w-8 h-8 rounded-[9px] flex items-center justify-center hover:bg-[#f5f5f3] active:bg-[#f0f0ee] transition-colors shrink-0 md:hidden">
          <svg className="w-4 h-4 stroke-black" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>

        <div className="w-[34px] h-[34px] rounded-[9px] bg-[#080808] text-white flex items-center justify-center text-[11px] font-medium shrink-0">
          {room.name.slice(0, 2).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-medium text-black">{room.name}</div>
          <button
            onClick={() => setShowMembers(v => !v)}
            className="text-[10px] font-mono font-light text-[#a0a09a] hover:text-black transition-colors"
          >
            {room.members.length} member{room.members.length !== 1 ? 's' : ''} · tap to {showMembers ? 'hide' : 'show'}
          </button>
        </div>

        <button onClick={copyId}
          className="px-2.5 py-1 rounded-full border border-[#e4e4e0] text-[9px] font-mono font-light text-[#8a8a84] hover:border-black hover:text-black transition-colors shrink-0">
          Copy ID
        </button>
        <button onClick={handleLeave}
          className="w-8 h-8 rounded-[9px] flex items-center justify-center hover:bg-[#fee2e2] active:bg-[#fee2e2] transition-colors shrink-0" title="Leave room">
          <svg className="w-[14px] h-[14px] stroke-[#ef4444]" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>

      {/* Members panel */}
      <AnimatePresence>
        {showMembers && (
          <motion.div
            className="border-b border-[#ebebea] bg-[#f9f9f8] px-4 py-3 overflow-hidden"
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <div className="flex flex-wrap gap-2">
              {room.members.map(m => (
                <div key={m.id}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-[#e8e8e4]">
                  <div className={cn(
                    'w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-medium',
                    m.id === myId ? 'bg-[#080808] text-white' : 'bg-[#f0f0ee] text-[#5a5a55]'
                  )}>
                    {m.initials}
                  </div>
                  <span className="text-[11px] font-medium text-black">{m.id === myId ? 'You' : m.name}</span>
                  <div className={cn('w-[4px] h-[4px] rounded-full', m.connected ? 'bg-[#22c55e]' : 'bg-[#d0d0cc]')} />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div ref={msgRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-2 scroll-touch" style={{ background: '#fefefe' }}>
        {thread.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
            <svg className="w-10 h-10 stroke-[#deded8]" fill="none" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <p className="text-[11px] font-mono font-light text-[#c0c0bc]">Group is ready — say something!</p>
          </div>
        ) : (
          thread.map(msg => {
            const isMe   = msg.peerId === myId;
            const sender = room.members.find(m => m.id === msg.peerId);
            return (
              <div key={msg.id} className={cn('flex flex-col max-w-[80%]', isMe ? 'self-end items-end' : 'self-start items-start')}>
                {!isMe && (
                  <span className="text-[10px] font-mono font-light text-[#a0a09a] mb-1 px-1">
                    {sender?.name ?? '…'}
                  </span>
                )}
                <div className={cn(
                  'px-3.5 py-2.5 text-[14px] leading-[1.55] break-words rounded-[18px]',
                  isMe ? 'bg-[#080808] text-white rounded-br-[5px]' : 'bg-[#f0f0ee] text-black rounded-bl-[5px]'
                )}>
                  {msg.text}
                </div>
                <span className="text-[9px] font-mono font-light text-[#c8c8c2] mt-1.5 px-1">
                  {formatTime(new Date(msg.ts))}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Input */}
      <div className="border-t border-[#ebebea] px-4 py-2.5 shrink-0 bg-white"
           style={{ paddingBottom: 'calc(10px + var(--safe-bottom))' }}>
        <div className="flex items-end gap-2 bg-[#f5f5f3] rounded-[22px] px-4 py-[9px]">
          <textarea
            ref={taRef} rows={1} value={text}
            className="flex-1 text-[14px] font-sans bg-transparent resize-none placeholder-[#c0c0bc] text-black leading-[1.4] max-h-[110px] scroll-touch"
            style={{ border: 'none', outline: 'none', boxShadow: 'none' }}
            placeholder={`Message ${room.name}…`}
            onChange={e => { setText(e.target.value); autoResize(); }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          />
          <button onClick={send}
            className="w-7 h-7 rounded-full bg-[#080808] flex items-center justify-center shrink-0 active:scale-90 transition-transform duration-100 mb-[-1px]">
            <svg className="w-[12px] h-[12px]" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Groups screen ──────────────────────────────────────────────────────────────
export function GroupsScreen() {
  const rooms        = useNexusStore(selectRoomList);
  const activeRoomId = useNexusStore(s => s.activeRoomId);
  const setActiveRoom= useNexusStore(s => s.setActiveRoom);
  const groupUnread  = useNexusStore(s => s.groupUnread);
  const [showModal,  setShowModal] = useState(false);

  const activeRoom = rooms.find(r => r.id === activeRoomId);

  if (activeRoom) {
    return <GroupChat room={activeRoom} onBack={() => setActiveRoom(null)} />;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#ebebea] shrink-0">
        <h2 className="text-[16px] font-medium text-black">Groups</h2>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3 py-[6px] rounded-full border border-[#e4e4e0] text-[11px] font-medium hover:border-black active:border-black transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" viewBox="0 0 24 24">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Room
        </button>
      </div>

      {/* Room list */}
      <div className="flex-1 overflow-y-auto scroll-touch">
        {rooms.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center">
            <svg className="w-12 h-12 stroke-[#deded8]" fill="none" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <div>
              <p className="text-[14px] font-medium text-[#5a5a55]">No group rooms yet</p>
              <p className="text-[11px] font-mono font-light text-[#a0a09a] mt-1 leading-relaxed">
                Create a room and share the ID with<br />anyone on NEXUS to start chatting
              </p>
            </div>
            <button onClick={() => setShowModal(true)}
              className="px-5 py-2.5 bg-[#080808] text-white rounded-full text-[12px] font-medium active:opacity-70 transition-opacity">
              Create a Room
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[#f5f5f3]">
            {rooms.map(room => {
              const unread = groupUnread[room.id] ?? 0;
              return (
                <button
                  key={room.id}
                  onClick={() => setActiveRoom(room.id)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[#f9f9f8] active:bg-[#f5f5f3] transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-[10px] bg-[#080808] text-white flex items-center justify-center text-[13px] font-medium shrink-0">
                    {room.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium text-black">{room.name}</div>
                    <div className="text-[10px] font-mono font-light text-[#a0a09a] mt-0.5">
                      {room.members.length} member{room.members.length !== 1 ? 's' : ''}
                      {' · '}{room.members.filter(m => m.connected).length} online
                    </div>
                  </div>
                  {unread > 0 && (
                    <div className="w-5 h-5 rounded-full bg-[#080808] text-white text-[10px] font-medium flex items-center justify-center shrink-0">
                      {unread > 9 ? '9+' : unread}
                    </div>
                  )}
                  <svg className="w-4 h-4 stroke-[#c0c0bc] shrink-0" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showModal && <RoomModal onClose={() => setShowModal(false)} />}
      </AnimatePresence>
    </div>
  );
}
