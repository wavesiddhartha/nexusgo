'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
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
  const myName        = useNexusStore(s => s.myName);
  const manager       = useNexusStore(s => s.manager);
  const sendGroupMsg  = useNexusStore(s => s.sendGroupMessage);
  const leaveRoom     = useNexusStore(s => s.leaveRoom);
  const thread        = useNexusStore(selectGroupThread(room.id));

  const [text,         setText]         = useState('');
  const [showMembers,  setShowMembers]  = useState(false);
  
  // Group Voice Call states
  const [callState,    setCallState]    = useState<'active' | null>(null);
  const [callInvite,   setCallInvite]   = useState<{ id: string; callerName: string } | null>(null);
  const [callMembers,  setCallMembers]  = useState<string[]>([]);
  const [localMute,    setLocalMute]    = useState(false);
  const localStreamRef                  = useRef<MediaStream | null>(null);

  const taRef     = useRef<HTMLTextAreaElement>(null);
  const msgRef    = useAutoscroll([thread.length]);
  const autoResize = useAutoResize(taRef);

  // Group Call signaling listeners
  useEffect(() => {
    if (!manager) return;
    const unsub = manager.on((ev: any) => {
      if (ev.type === 'group-call-invite' && ev.roomId === room.id) {
        if (ev.callerId !== myId) {
          setCallInvite({ id: ev.callerId, callerName: ev.callerName });
          setCallMembers(prev => [...new Set([...prev, ev.callerId])]);
        }
      }
      if (ev.type === 'group-call-join' && ev.roomId === room.id) {
        if (ev.joinerId !== myId) {
          setCallMembers(prev => [...new Set([...prev, ev.joinerId])]);
          toast(`${room.members.find(m => m.id === ev.joinerId)?.name || 'Someone'} joined conference`);
        }
      }
      if (ev.type === 'group-call-leave' && ev.roomId === room.id) {
        setCallMembers(prev => prev.filter(id => id !== ev.leaverId));
      }
    });
    return () => {
      unsub();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [manager, room.id, myId]);

  const startCall = async () => {
    if (!manager) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      setCallState('active');
      setLocalMute(false);

      room.members.forEach(member => {
        const conn = (manager as any).peers?.get(member.id);
        if (conn?.dc?.readyState === 'open') {
          (manager as any).dc_send(conn, { type: 'group-call-invite', roomId: room.id, callerId: myId, callerName: myName });
          stream.getTracks().forEach(t => conn.pc.addTrack(t, stream));
        }
      });
      toast.success('Group voice call started ✓');
    } catch (e: any) {
      toast.error('Microphone permission denied');
    }
  };

  const joinCall = async () => {
    if (!manager) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      setCallState('active');
      setLocalMute(false);
      setCallInvite(null);

      room.members.forEach(member => {
        const conn = (manager as any).peers?.get(member.id);
        if (conn?.dc?.readyState === 'open') {
          (manager as any).dc_send(conn, { type: 'group-call-join', roomId: room.id, joinerId: myId });
          stream.getTracks().forEach(t => conn.pc.addTrack(t, stream));
        }
      });
      toast.success('Joined group conference ✓');
    } catch (e: any) {
      toast.error('Microphone permission denied');
    }
  };

  const toggleMic = () => {
    if (localStreamRef.current) {
      const tracks = localStreamRef.current.getAudioTracks();
      tracks.forEach(t => t.enabled = !t.enabled);
      setLocalMute(!localMute);
      toast(localMute ? 'Microphone unmuted' : 'Microphone muted');
    }
  };

  const leaveCall = () => {
    if (!manager) return;
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    room.members.forEach(member => {
      const conn = (manager as any).peers?.get(member.id);
      if (conn?.dc?.readyState === 'open') {
        (manager as any).dc_send(conn, { type: 'group-call-leave', roomId: room.id, leaverId: myId });
        const senders = conn.pc.getSenders();
        senders.forEach((sender: any) => {
          if (sender.track?.kind === 'audio') {
            conn.pc.removeTrack(sender);
          }
        });
      }
    });
    setCallState(null);
    setCallMembers([]);
    toast('Left group conference');
  };

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

        {/* Group Voice Call trigger */}
        {room.members.filter(m => m.connected).length > 0 && !callState && (
          <button
            onClick={startCall}
            className="w-8 h-8 rounded-[9px] flex items-center justify-center hover:bg-[#f5f5f3] active:bg-[#f0f0ee] transition-colors shrink-0"
            title="Start group call"
          >
            <svg className="w-[15px] h-[15px] stroke-[#5a5a55]" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          </button>
        )}

        <button onClick={handleLeave}
          className="w-8 h-8 rounded-[9px] flex items-center justify-center hover:bg-[#fee2e2] active:bg-[#fee2e2] transition-colors shrink-0" title="Leave room">
          <svg className="w-[14px] h-[14px] stroke-[#ef4444]" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>

      {/* Active Conference bar */}
      {callState && (
        <div className="backdrop-blur-md bg-white/75 border-b border-[#ebebea]/60 px-4 py-3 flex items-center justify-between animate-fadeIn select-none shadow-[0_8px_32px_rgba(8,8,8,0.02)]">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-1.5 overflow-hidden p-0.5">
              <div className={cn(
                "w-8 h-8 rounded-full bg-[#080808] text-white border-2 border-white flex items-center justify-center text-[10px] font-medium z-20 transition-all duration-300",
                !localMute && "border-green-500 speaker-ring-active"
              )}>
                yo
              </div>
              {callMembers.map(mid => {
                const member = room.members.find(m => m.id === mid);
                if (!member) return null;
                return (
                  <div
                    key={mid}
                    className="w-8 h-8 rounded-full bg-white border-2 border-white flex items-center justify-center text-[10px] font-medium relative shadow-sm transition-all duration-300 speaker-ring-active border-green-500/80"
                    style={{ zIndex: 10 }}
                  >
                    {member.initials}
                  </div>
                );
              })}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-[12px] font-medium text-black">Voice Call Active</h4>
                {!localMute && (
                  <div className="flex items-end gap-[1.5px] h-[10px] w-[12px] mb-0.5 shrink-0 select-none">
                    <span className="w-[2px] bg-[#22c55e] rounded-full eq-bar-1 origin-bottom h-full block" />
                    <span className="w-[2px] bg-[#22c55e] rounded-full eq-bar-2 origin-bottom h-full block" />
                    <span className="w-[2px] bg-[#22c55e] rounded-full eq-bar-3 origin-bottom h-full block" />
                  </div>
                )}
              </div>
              <p className="text-[10px] font-mono font-light text-[#22c55e] mt-0.5">{callMembers.length + 1} connected</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMic}
              className={cn(
                "w-8 h-8 rounded-[9px] flex items-center justify-center transition-colors border",
                localMute ? "bg-red-50 border-red-200 text-red-500" : "bg-white border-[#e4e4e0] text-[#5a5a55]"
              )}
            >
              {localMute ? (
                <svg className="w-[14px] h-[14px] stroke-red-500 fill-none" strokeWidth="2" viewBox="0 0 24 24"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
              ) : (
                <svg className="w-[14px] h-[14px] stroke-current fill-none" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
              )}
            </button>
            <button
              onClick={leaveCall}
              className="w-8 h-8 rounded-[9px] bg-red-500 border border-red-600 flex items-center justify-center text-white active:scale-90 transition-transform"
            >
              <svg className="w-[14px] h-[14px] stroke-white fill-none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="m16.5 6.5-2.3 2.3a3 3 0 0 0 0 4.24l1.42 1.42a3 3 0 0 1 0 4.24l-1.42 1.42a3 3 0 0 1-4.24 0L8.5 18.5a3 3 0 0 0-4.24 0L2 20.76"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Group Call active Invitation banner */}
      {callInvite && !callState && (
        <div className="mx-4 my-2.5 bg-[#fefefe] border border-amber-400/35 rounded-[18px] p-3.5 flex items-center justify-between shadow-[0_4px_16px_rgba(234,179,8,0.06)] animate-fadeIn select-none">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center animate-pulse shrink-0">
              <svg className="w-4 h-4 stroke-[#eab308]" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
            </div>
            <div>
              <h4 className="text-[13px] font-medium text-black">Group Voice Call Active</h4>
              <p className="text-[10px] font-mono font-light text-[#a0a09a] mt-0.5">Started by {callInvite.callerName}</p>
            </div>
          </div>
          <button
            onClick={joinCall}
            className="px-4 py-2 bg-[#22c55e] text-white text-[12px] font-medium rounded-[10px] active:scale-95 transition-transform cursor-pointer"
          >
            Join Call
          </button>
        </div>
      )}

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
