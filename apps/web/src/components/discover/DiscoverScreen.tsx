'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
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
  const svgRef    = useRef<SVGSVGElement>(null);
  const dims      = useCanvasDimensions(canvasRef);

  const [popup,  setPopup]  = useState<{ peer: RemotePeer; x: number; y: number } | null>(null);
  const [mode,   setMode]   = useState<'wifi' | 'bt' | 'relay'>('wifi');
  const [msgVal, setMsgVal] = useState('');

  const selectedPeer = peers.find(p => p.id === selectedId) ?? null;
  const myIni = nameToInitials(myName || 'NX');

  // Draw SVG connector lines
  useEffect(() => {
    if (!svgRef.current || dims.w === 0) return;
    const svg = svgRef.current;
    svg.innerHTML = '';
    svg.setAttribute('width',  String(dims.w));
    svg.setAttribute('height', String(dims.h));
    const cx = dims.w / 2, cy = dims.h / 2;
    peers.forEach((p, i) => {
      const [fx, fy] = POSITIONS[i % POSITIONS.length];
      const nx = fx * dims.w, ny = fy * dims.h;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(cx)); line.setAttribute('y1', String(cy));
      line.setAttribute('x2', String(nx)); line.setAttribute('y2', String(ny));
      const sel = p.id === selectedId;
      if (sel) {
        line.setAttribute('stroke', '#deded8');
        line.setAttribute('stroke-width', '0.7');
        line.setAttribute('stroke-dasharray', '4 4');
        line.classList.add('dash-animate');
      } else {
        line.setAttribute('stroke', '#ebebea');
        line.setAttribute('stroke-width', '0.5');
      }
      svg.appendChild(line);
    });
  }, [peers, dims, selectedId]);

  const handleNodeClick = useCallback((peer: RemotePeer, e: React.MouseEvent, i: number) => {
    e.stopPropagation();
    setSelected(peer.id);
    if (dims.w === 0) return;
    const [fx, fy] = POSITIONS[i % POSITIONS.length];
    const nx = fx * dims.w, ny = fy * dims.h;
    const popW = 192, popH = 152;
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
    <div className="flex flex-col h-full" style={{ background: '#fafaf9' }}>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="flex-1 relative overflow-hidden"
        onClick={dismissPopup}
      >
        {/* Label */}
        <div className="absolute top-4 left-4 z-10 pointer-events-none">
          <span className="text-[10px] font-mono font-light text-[#b0b0a8] tracking-widest uppercase">
            Network ·{' '}
            <strong className="text-black font-normal">
              {peers.length} peer{peers.length !== 1 ? 's' : ''}
            </strong>
          </span>
        </div>

        {/* SVG lines */}
        <svg ref={svgRef} className="absolute inset-0 pointer-events-none" />

        {/* Me node */}
        <div
          className="absolute z-10"
          style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)' }}
        >
          <div className="flex flex-col items-center gap-1.5">
            <div className="relative flex items-center justify-center">
              {[0, 1.5].map((delay, ri) => (
                <div
                  key={ri}
                  className="absolute rounded-full border border-black/[0.08] pointer-events-none"
                  style={{ left: '50%', top: '50%', width: 54, height: 54, animation: `ring-pulse 3.8s ease-out ${delay}s infinite` }}
                />
              ))}
              <div className="w-[48px] h-[48px] rounded-full bg-[#080808] text-white flex items-center justify-center text-[13px] font-medium relative z-10 shadow-[0_2px_16px_rgba(8,8,8,0.18)]">
                yo
              </div>
            </div>
            <span className="text-[9px] font-mono font-light text-[#080808] tracking-wide">you</span>
          </div>
        </div>

        {/* Peer nodes */}
        <AnimatePresence>
          {peers.map((peer, i) => {
            const [fx, fy] = POSITIONS[i % POSITIONS.length];
            const isSel = peer.id === selectedId;
            return (
              <motion.div
                key={peer.id}
                className="absolute z-10 cursor-grab active:cursor-grabbing"
                style={{ left: `${fx * 100}%`, top: `${fy * 100}%`, transform: 'translate(-50%,-50%)' }}
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
                  className="flex flex-col items-center gap-1 cursor-pointer group"
                  onClick={e => handleNodeClick(peer, e, i)}
                >
                  <div className="relative flex items-center justify-center">
                    <div
                      className="absolute rounded-full border border-black/[0.04] pointer-events-none"
                      style={{ 
                        left: '50%',
                        top: '50%',
                        width: 46, 
                        height: 46, 
                        animation: `ring-pulse 4.8s ease-out ${(i * 0.55) % 2.4}s infinite` 
                      }}
                    />
                    <div
                      className={cn(
                        'w-[38px] h-[38px] rounded-full flex items-center justify-center text-[11px] font-medium relative z-10 transition-all duration-300 shadow-[0_1px_6px_rgba(8,8,8,0.06)]',
                        isSel
                          ? 'border-[1.8px] border-[#080808] scale-105 shadow-[0_4px_12px_rgba(8,8,8,0.08)]'
                          : 'border border-[#deded8] group-hover:border-[#080808] group-hover:scale-105',
                        !peer.connected && !isSel && 'opacity-50'
                      )}
                      style={{ background: getAvatarGradient(peer.name) }}
                    >
                      {peer.initials}
                    </div>
                  </div>
                  <span className="text-[9px] font-mono font-light text-[#8a8a84] max-w-[72px] truncate text-center leading-none">
                    {peer.name}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Empty state */}
        {peers.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center space-y-1.5">
              <p className="text-[11px] font-mono font-light text-[#d0d0cc] tracking-widest uppercase">Scanning…</p>
              <p className="text-[10px] font-mono font-light text-[#deded8]">Open on another device to connect</p>
            </div>
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
              <div className="w-48 bg-white rounded-[16px] border border-[#e8e8e4] shadow-[0_8px_32px_rgba(8,8,8,0.11)] p-3.5">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-8 h-8 rounded-full bg-[#f0f0ee] flex items-center justify-center text-[11px] font-medium shrink-0">
                    {popup.peer.initials}
                  </div>
                  <div>
                    <div className="text-[13px] font-medium text-black leading-tight">{popup.peer.name}</div>
                    <div className="text-[10px] font-mono font-light text-[#a0a09a]">
                      {popup.peer.pingMs != null ? `${popup.peer.pingMs}ms · ` : ''}WebRTC
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-[2px]">
                  {[
                    {
                      label: 'Open chat',
                      icon: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>,
                      fn: () => { setActivePeer(popup.peer.id); setScreen('chat'); setPopup(null); },
                    },
                    {
                      label: 'Send file',
                      icon: <><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></>,
                      fn: () => { setActivePeer(popup.peer.id); setScreen('chat'); setPopup(null); },
                    },
                    {
                      label: 'Dismiss',
                      icon: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
                      fn: () => { setPopup(null); setSelected(null); },
                    },
                  ].map(({ label, icon, fn }) => (
                    <button
                      key={label}
                      onClick={fn}
                      className="flex items-center gap-2.5 px-2.5 py-[8px] rounded-[9px] text-[12px] text-[#2a2a28] hover:bg-[#f5f5f3] active:bg-[#f0f0ee] transition-colors w-full text-left"
                    >
                      <svg className="w-[13px] h-[13px] stroke-[#9a9a94] flex-shrink-0" fill="none" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
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
        <div className="absolute bottom-3.5 right-3.5 flex gap-1.5 z-10">
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
        className="bg-white border-t border-[#ebebea] px-4 pt-3"
        style={{ paddingBottom: 'calc(12px + var(--safe-bottom))' }}
      >
        <div className="text-[10px] font-mono font-light text-[#a0a09a] mb-2.5">
          →&nbsp;
          <span className="text-[#080808] font-normal">{selectedPeer?.name ?? 'tap a peer'}</span>
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
              onClick={() => handleDirectShare(label)}
              className="flex items-center gap-1.5 shrink-0 px-3 py-[6px] rounded-full border border-[#e4e4e0] bg-white text-[11px] text-[#6a6a64] hover:border-[#a0a09a] hover:text-black active:border-black active:text-black transition-colors duration-150"
            >
              <svg className="w-[11px] h-[11px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                {path}
              </svg>
              {label}
            </button>
          ))}
        </div>

        {/* Message input */}
        <div className="flex items-center gap-2.5 bg-[#f5f5f3] rounded-full px-4 py-[9px] border border-transparent transition-colors duration-150 focus-within:border-[#d8d8d4]">
          <input
            className="flex-1 text-[14px] font-sans bg-transparent placeholder-[#c8c8c2] text-black leading-none"
            style={{ border: 'none', outline: 'none', boxShadow: 'none' }}
            placeholder={selectedPeer?.connected ? `Message ${selectedPeer.name}…` : selectedPeer ? 'Connecting…' : 'Select a peer first…'}
            disabled={!selectedId || !selectedPeer?.connected}
            value={msgVal}
            onChange={e => setMsgVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
          />
          <button
            onClick={handleSend}
            disabled={!msgVal.trim() || !selectedId}
            className="w-7 h-7 rounded-full bg-[#080808] flex items-center justify-center shrink-0 active:scale-90 transition-transform duration-100 disabled:opacity-30"
          >
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
