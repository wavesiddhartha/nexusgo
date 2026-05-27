'use client';

import { useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNexusStore, selectPeerList } from '@/store/nexus.store';
import type { RemotePeer } from '@/lib/webrtc-manager';
import { useCanvasDimensions } from '@/hooks';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const POSITIONS: [number, number][] = [
  [0.27, 0.27], [0.73, 0.25], [0.79, 0.68], [0.21, 0.70],
  [0.50, 0.15], [0.85, 0.46], [0.50, 0.81], [0.15, 0.46],
  [0.63, 0.19], [0.37, 0.19], [0.88, 0.63], [0.12, 0.63],
];

function nameToInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getAvatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue1 = Math.abs(hash % 360);
  const hue2 = Math.abs((hash * 7 + 120) % 360);
  return `linear-gradient(135deg, hsl(${hue1}, 80%, 93%), hsl(${hue2}, 80%, 93%))`;
}

function isConnecting(peer: RemotePeer): boolean {
  const s = peer.connectionState as string;
  return s === 'connecting' || s === 'new';
}

export function DiscoverScreen() {
  const peers         = useNexusStore(selectPeerList);
  const selectedId    = useNexusStore(s => s.selectedPeerId);
  const setSelected   = useNexusStore(s => s.setSelectedPeer);
  const setActivePeer = useNexusStore(s => s.setActivePeer);
  const setScreen     = useNexusStore(s => s.setScreen);
  const sendMessage   = useNexusStore(s => s.sendMessage);
  const sendFile      = useNexusStore(s => s.sendFile);
  const myName        = useNexusStore(s => s.myName);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dims      = useCanvasDimensions(canvasRef);

  const [popup,  setPopup]  = useState<{ peer: RemotePeer; x: number; y: number } | null>(null);
  const [mode,   setMode]   = useState<'wifi' | 'bt' | 'relay'>('wifi');
  const [msgVal, setMsgVal] = useState('');

  const selectedPeer = peers.find(p => p.id === selectedId) ?? null;
  const myIni = nameToInitials(myName || 'NX');

  const handleNodeClick = useCallback((peer: RemotePeer, e: React.MouseEvent, i: number) => {
    e.stopPropagation();
    setSelected(peer.id);
    if (dims.w === 0) return;
    const [fx, fy] = POSITIONS[i % POSITIONS.length];
    const nx = fx * dims.w, ny = fy * dims.h;
    const popW = 192, popH = 172;
    let x = nx + 58;
    let y = ny - 8;
    if (x + popW > dims.w - 12) x = nx - popW - 12;
    if (y + popH > dims.h - 12) y = dims.h - popH - 12;
    if (y < 8) y = 8;
    setPopup({ peer, x: Math.max(6, x), y });
  }, [dims, setSelected]);

  const dismissPopup = useCallback(() => { setPopup(null); }, []);

  const handleSend = useCallback(() => {
    const v = msgVal.trim();
    if (!v || !selectedId) return;
    if (!selectedPeer?.connected) return;
    sendMessage(selectedId, v);
    toast.success(`Message sent to ${selectedPeer.name} ✓`);
    setMsgVal('');
  }, [msgVal, selectedId, selectedPeer, sendMessage]);

  const handleDirectShare = useCallback(async (type: string) => {
    if (!selectedId || !selectedPeer?.connected) {
      toast.error('Select a connected peer first');
      return;
    }
    
    if (type === 'File' || type === 'Photo') {
      const el = document.createElement('input');
      el.type = 'file';
      if (type === 'Photo') el.accept = 'image/*';
      el.onchange = async () => {
        const file = el.files?.[0];
        if (file) {
          toast(`Sending ${file.name} to ${selectedPeer.name}…`);
          try {
            await sendFile(selectedId, file);
            toast.success(`Sent successfully to ${selectedPeer.name} ✓`);
          } catch (e: any) {
            toast.error(e.message || 'Transfer failed');
          }
        }
      };
      el.click();
    } else if (type === 'Link') {
      const url = window.prompt(`Share a link with ${selectedPeer.name}:`);
      if (url?.trim()) {
        sendMessage(selectedId, url.trim());
        toast.success(`Shared link with ${selectedPeer.name} ✓`);
      }
    } else if (type === 'Location') {
      if (!navigator.geolocation) {
        toast.error('Geolocation is not supported by your browser');
        return;
      }
      toast('Fetching your location…');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          const locMsg = `My Location: https://maps.google.com/?q=${latitude},${longitude}`;
          sendMessage(selectedId, locMsg);
          toast.success(`Shared location with ${selectedPeer.name} ✓`);
        },
        (err) => {
          toast.error('Failed to get location: ' + err.message);
        }
      );
    }
  }, [selectedId, selectedPeer, sendFile, sendMessage]);

  return (
    <div className="flex flex-col h-full bg-[#fafaf9]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-[#f0f0ed]">
        <div className="flex items-center gap-4 select-none">
          <span className="text-[14px] font-mono font-bold tracking-[0.25em] text-black uppercase">
            NEXUS
          </span>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 rounded-full border border-green-100/50">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
            <span className="text-[10px] font-mono font-medium text-green-700">
              {peers.length} peer{peers.length !== 1 ? 's' : ''} nearby
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 select-none">
          <div className="px-3.5 py-1 bg-[#f5f5f3] rounded-full border border-[#ebebe8] text-[11px] font-mono text-black">
            {myName || 'you'}
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="flex-1 relative overflow-hidden"
        onClick={dismissPopup}
      >
        {/* Label */}
        <div className="absolute top-4 left-6 z-10 pointer-events-none select-none">
          <span className="text-[10px] font-mono font-bold text-gray-400 tracking-wider uppercase">
            NETWORK · <strong className="text-black font-semibold">{peers.length} PEERS</strong>
          </span>
        </div>

        {/* Legend */}
        <div className="absolute top-4 right-6 z-10 flex flex-col gap-1.5 bg-white/80 backdrop-blur-md px-3.5 py-2.5 rounded-xl border border-gray-100 shadow-sm text-[9px] font-mono select-none text-gray-500">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
            <span>connected</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
            <span>connecting</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-gray-200 border border-gray-300" />
            <span>discovered</span>
          </div>
        </div>

        {/* Dynamic Declarative Connections and Animated Data Signal Packets */}
        <svg className="absolute inset-0 w-full h-full block pointer-events-none">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="15" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 2 L 7 5 L 0 8 z" fill="#22c55e" />
            </marker>
            <marker id="arrow-connecting" viewBox="0 0 10 10" refX="15" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 2 L 7 5 L 0 8 z" fill="#f59e0b" />
            </marker>
          </defs>

          {dims.w > 0 && peers.map((p, i) => {
            const [fx, fy] = POSITIONS[i % POSITIONS.length];
            const nx = fx * dims.w;
            const ny = fy * dims.h;
            const cx = dims.w / 2;
            const cy = dims.h / 2;

            // Compute quadratic bezier curve for smooth organic wire look
            const dx = nx - cx;
            const dy = ny - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);

            let pathD = `M ${cx} ${cy} L ${nx} ${ny}`;
            if (dist > 0) {
              const midX = (cx + nx) / 2;
              const midY = (cy + ny) / 2;
              const px = -dy / dist;
              const py = dx / dist;
              const curveDirection = i % 2 === 0 ? 1 : -1;
              const offset = dist * 0.05 * curveDirection;
              const controlX = midX + px * offset;
              const controlY = midY + py * offset;
              pathD = `M ${cx} ${cy} Q ${controlX} ${controlY} ${nx} ${ny}`;
            }

            const isSel = p.id === selectedId;
            const state = p.connected ? 'connected' : (isConnecting(p) ? 'connecting' : 'discovered');

            let strokeColor = 'rgba(200, 200, 190, 0.25)';
            let strokeWidth = 1.0;
            let dashArray: string | undefined = undefined;

            if (state === 'connected') {
              strokeColor = '#a7f3d0'; // light green wire
              strokeWidth = 1.15;
            } else if (state === 'connecting') {
              strokeColor = '#fde68a'; // light amber wire
              strokeWidth = 1.15;
              dashArray = '4 4';
            }

            if (isSel) {
              strokeWidth = 1.45;
              if (state === 'connected') {
                strokeColor = '#22c55e'; // vibrant green
                dashArray = '4 4';
              } else if (state === 'connecting') {
                strokeColor = '#f59e0b'; // vibrant amber
              }
            }

            return (
              <g key={p.id}>
                <path
                  d={pathD}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeDasharray={dashArray}
                  markerEnd={isSel ? (state === 'connecting' ? 'url(#arrow-connecting)' : 'url(#arrow)') : undefined}
                  className={cn(isSel && 'dash-animate')}
                />
                {/* Bouncing Data Packet animation with pause at both ends */}
                {state === 'connected' && (
                  <circle r="3.5" fill="#22c55e" className="opacity-80">
                    <animateMotion
                      dur="4.5s"
                      repeatCount="indefinite"
                      path={pathD}
                      keyPoints="0;1;1;0;0"
                      keyTimes="0;0.43;0.57;1;1"
                      calcMode="linear"
                    />
                  </circle>
                )}
              </g>
            );
          })}
        </svg>

        {/* Concentric calm soft green rings */}
        {dims.w > 0 && [0.3, 0.58, 0.86].map((scale, idx) => {
          const size = Math.min(dims.w, dims.h) * 0.44 * scale * 2;
          return (
            <div
              key={idx}
              className="absolute rounded-full border border-green-500/[0.04] pointer-events-none animate-pulse-slow"
              style={{
                width: size,
                height: size,
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                animationDelay: `${idx * 0.5}s`
              }}
            />
          );
        })}

        {/* Me node */}
        <div
          className="absolute z-10"
          style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)' }}
        >
          <div className="flex flex-col items-center gap-1.5 select-none">
            <div className="relative w-[52px] h-[52px] flex items-center justify-center">
              {/* Calm green pulse wave ripples */}
              {[0, 2.0, 4.0].map((delay, ri) => (
                <div
                  key={ri}
                  className="absolute rounded-full border border-green-500/10 pointer-events-none sonar-wave-active"
                  style={{ 
                    left: '50%', 
                    top: '50%', 
                    transform: 'translate(-50%, -50%)',
                    width: 52, 
                    height: 52, 
                    animationDelay: `${delay}s`,
                    background: 'radial-gradient(circle, rgba(34,197,94,0.015) 0%, rgba(34,197,94,0.03) 70%, rgba(34,197,94,0) 100%)',
                  }}
                />
              ))}
              <div className="w-12 h-12 rounded-full bg-black text-white flex items-center justify-center text-[14px] font-mono font-semibold relative z-10 shadow-[0_6px_24px_rgba(0,0,0,0.12)] transition-all duration-300 hover:scale-105 active:scale-95">
                {myIni}
              </div>
            </div>
            <span className="text-[10px] font-mono text-gray-500 mt-1 select-none">you</span>
          </div>
        </div>

        {/* Peer nodes */}
        <AnimatePresence>
          {peers.map((peer, i) => {
            const [fx, fy] = POSITIONS[i % POSITIONS.length];
            const isSel = peer.id === selectedId;
            const state = peer.connected ? 'connected' : (isConnecting(peer) ? 'connecting' : 'discovered');

            let avatarClass = '';
            let initialsClass = '';
            let labelClass = '';

            if (state === 'connected') {
              avatarClass = 'border-[#22c55e] bg-green-500/[0.06] shadow-[0_2px_8px_rgba(34,197,94,0.06)]';
              initialsClass = 'text-green-700';
              labelClass = 'text-green-800 font-semibold';
            } else if (state === 'connecting') {
              avatarClass = 'border-[#f59e0b] bg-amber-500/[0.06] border-dashed animate-pulse-fast';
              initialsClass = 'text-amber-700';
              labelClass = 'text-amber-800 font-medium';
            } else {
              avatarClass = 'border-gray-200 bg-white hover:border-gray-400';
              initialsClass = 'text-gray-500';
              labelClass = 'text-gray-600';
            }

            if (isSel) {
              avatarClass += ' ring-2 ring-black ring-offset-2 scale-105';
            }

            return (
              <motion.div
                key={peer.id}
                className="absolute z-10"
                style={{ left: `${fx * 100}%`, top: `${fy * 100}%` }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                drag
                dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                dragElastic={0.5}
                dragTransition={{ bounceStiffness: 420, bounceDamping: 22 }}
                whileDrag={{ scale: 1.15, zIndex: 40 }}
              >
                <div
                  className="flex flex-col items-center gap-1.5 cursor-pointer group select-none"
                  style={{ transform: 'translate(-50%,-50%)' }}
                  onClick={e => handleNodeClick(peer, e, i)}
                >
                  <div className="relative flex items-center justify-center">
                    {state === 'connecting' && (
                      <div className="absolute w-[44px] h-[44px] rounded-full border border-amber-500/20 animate-ping-slow pointer-events-none" />
                    )}
                    <div
                      className={cn(
                        'w-11 h-11 rounded-full border flex items-center justify-center text-[12px] font-mono font-medium relative z-10 transition-all duration-300 shadow-[0_1px_4px_rgba(0,0,0,0.03)]',
                        avatarClass
                      )}
                    >
                      <span className={initialsClass}>{peer.initials}</span>
                    </div>
                  </div>
                  <span className={cn('text-[10px] font-mono max-w-[80px] truncate text-center leading-none', labelClass)}>
                    {peer.name}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Empty state positioned beautifully */}
        {peers.length === 0 && (
          <div 
            className="absolute z-0 pointer-events-none text-center space-y-1.5"
            style={{ left: '50%', top: 'calc(50% - 110px)', transform: 'translate(-50%, -50%)' }}
          >
            <div className="flex items-center justify-center gap-1.5 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] inline-block" />
              <p className="text-[10px] font-mono font-semibold text-[#22c55e] tracking-widest uppercase">SCANNING…</p>
            </div>
            <p className="text-[9px] font-mono font-light text-[#b0b0a8] max-w-[190px] mx-auto leading-normal">Open on another device to connect instantly</p>
          </div>
        )}

        {/* Peer popup */}
        <AnimatePresence>
          {popup && (
            <motion.div
              className="absolute z-30"
              style={{ left: popup.x, top: popup.y }}
              initial={{ opacity: 0, scale: 0.88, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.90, y: 4 }}
              transition={{ type: 'spring', stiffness: 500, damping: 32 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="w-48 backdrop-blur-md bg-white/90 rounded-[20px] border border-gray-200/60 shadow-[0_12px_40px_rgba(0,0,0,0.06)] p-3.5 select-none transition-all duration-300">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-8.5 h-8.5 rounded-full border border-gray-100 flex items-center justify-center text-[11px] font-mono font-medium shrink-0 shadow-sm" style={{ background: getAvatarGradient(popup.peer.name) }}>
                    {popup.peer.initials}
                  </div>
                  <div>
                    <div className="text-[12px] font-mono font-semibold text-black leading-tight">{popup.peer.name}</div>
                    <div className="text-[9px] font-mono font-light text-[#22c55e] flex items-center gap-1.5 mt-0.5">
                      <span className={cn(
                        'w-1.5 h-1.5 rounded-full block',
                        popup.peer.connected ? 'bg-[#22c55e]' : (isConnecting(popup.peer) ? 'bg-[#f59e0b]' : 'bg-gray-300')
                      )} />
                      {popup.peer.connected ? 'P2P Active' : (isConnecting(popup.peer) ? 'Connecting…' : 'Discovered')}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-[2px]">
                  {[
                    {
                      label: 'Open chat',
                      icon: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>,
                      fn: () => { setActivePeer(popup.peer.id); setScreen('chat'); setPopup(null); },
                      disabled: !popup.peer.connected,
                    },
                    {
                      label: 'Send file',
                      icon: <><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></>,
                      fn: () => { handleDirectShare('File'); },
                      disabled: !popup.peer.connected,
                    },
                    {
                      label: 'Voice call',
                      icon: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>,
                      fn: () => { useNexusStore.getState().startCall(popup.peer.id, 'voice'); setPopup(null); },
                      disabled: !popup.peer.connected,
                    },
                    {
                      label: 'Dismiss',
                      icon: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
                      fn: () => { setPopup(null); setSelected(null); },
                      disabled: false,
                    },
                  ].map(({ label, icon, fn, disabled }) => (
                    <button
                      key={label}
                      disabled={disabled}
                      onClick={fn}
                      className="flex items-center gap-2.5 px-2.5 py-[8px] rounded-[10px] text-[11px] font-mono text-[#2a2a28] hover:bg-[#f5f5f3] active:bg-black active:text-white transition-all w-full text-left disabled:opacity-30 disabled:pointer-events-none"
                    >
                      <svg className="w-[12px] h-[12px] stroke-current text-[#9a9a94] flex-shrink-0 group-hover:text-black" fill="none" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                        {icon}
                      </svg>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mode toggle */}
        <div className="absolute bottom-3.5 right-6 flex gap-1.5 z-10">
          {(['wifi', 'bt', 'relay'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                'px-3 py-[5px] rounded-full text-[10px] font-mono font-light border transition-all duration-150',
                mode === m
                  ? 'bg-[#080808] text-white border-[#080808]'
                  : 'bg-white text-[#8a8a84] border-[#e0e0dc] hover:border-[#a0a09a]'
              )}
            >
              {m === 'wifi' ? 'Wi-Fi' : m === 'bt' ? 'BT' : 'Relay'}
            </button>
          ))}
        </div>
      </div>

      {/* Quick-send bar */}
      <div
        className="bg-white border-t border-[#ebebea] px-6 pt-4"
        style={{ paddingBottom: 'calc(16px + var(--safe-bottom))' }}
      >
        <div className="text-[10px] font-mono font-light text-[#a0a09a] mb-2.5 flex items-center gap-1.5 select-none">
          <span>→</span>
          {selectedPeer ? (
            <span className="text-[#080808] font-medium flex items-center gap-1.5">
              {selectedPeer.name}
              <span className={cn(
                'w-1.5 h-1.5 rounded-full inline-block',
                selectedPeer.connected ? 'bg-[#22c55e]' : (isConnecting(selectedPeer) ? 'bg-[#f59e0b]' : 'bg-gray-300')
              )} />
            </span>
          ) : (
            <span className="text-[#a0a09a]">tap a peer to connect</span>
          )}
        </div>

        {/* Chips */}
        <div className="flex gap-2 mb-3 overflow-x-auto pb-0.5 select-none">
          {[
            { label: 'File',     path: <><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></> },
            { label: 'Photo',    path: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></> },
            { label: 'Link',     path: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></> },
            { label: 'Location', path: <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></> },
          ].map(({ label, path }) => (
            <button
              key={label}
              disabled={!selectedPeer?.connected}
              onClick={() => handleDirectShare(label)}
              className="flex items-center gap-1.5 shrink-0 px-3.5 py-1.5 rounded-full border border-[#e4e4e0] bg-white text-[11px] text-[#6a6a64] hover:border-[#a0a09a] hover:text-black active:border-black active:text-black transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none"
            >
              <svg className="w-[11.5px] h-[11.5px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                {path}
              </svg>
              {label}
            </button>
          ))}
        </div>

        {/* Message input */}
        <div className="flex items-center gap-2.5 bg-[#f5f5f3] rounded-full px-4.5 py-2.5 border border-transparent transition-colors duration-150 focus-within:border-[#d8d8d4]">
          <input
            className="flex-1 text-[13px] font-mono bg-transparent placeholder-[#c8c8c2] text-black leading-none disabled:opacity-50"
            style={{ border: 'none', outline: 'none', boxShadow: 'none' }}
            placeholder={
              selectedPeer?.connected
                ? `Message ${selectedPeer.name}…`
                : selectedPeer
                ? `Connecting to ${selectedPeer.name}…`
                : 'Select a peer first…'
            }
            disabled={!selectedId || !selectedPeer?.connected}
            value={msgVal}
            onChange={e => setMsgVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
          />
          <button
            onClick={handleSend}
            disabled={!msgVal.trim() || !selectedId || !selectedPeer?.connected}
            className="w-7.5 h-7.5 rounded-full bg-black flex items-center justify-center shrink-0 active:scale-90 transition-transform duration-100 disabled:opacity-30"
          >
            <svg className="w-[11.5px] h-[11.5px]" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
