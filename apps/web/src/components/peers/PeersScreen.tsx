'use client';

import { useNexusStore, selectPeerList } from '@/store/nexus.store';
import { cn } from '@/lib/utils';
import type { RemotePeer } from '@/lib/webrtc-manager';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

function SignalBars({ pingMs }: { pingMs: number | null }) {
  const strength = pingMs == null ? 0 : pingMs < 80 ? 3 : pingMs < 200 ? 2 : 1;
  return (
    <div className="flex items-end gap-[2px]">
      {[1, 2, 3].map(b => (
        <div
          key={b}
          className={cn('w-[3px] rounded-sm transition-colors duration-200', b <= strength ? 'bg-[#080808]' : 'bg-[#e0e0dc]')}
          style={{ height: b * 4 + 3 }}
        />
      ))}
    </div>
  );
}

function PeerRow({ peer, onChat, onVoice, onVideo }: {
  peer: RemotePeer;
  onChat:  () => void;
  onVoice: () => void;
  onVideo: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#f5f5f3] hover:bg-[#f9f9f8] transition-colors">
      {/* Main tap area → open chat */}
      <button onClick={onChat} className="flex items-center gap-3 flex-1 min-w-0 text-left">
        <div className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center text-[12px] font-medium shrink-0 transition-colors',
          peer.connected ? 'bg-[#080808] text-white' : 'bg-[#f0f0ee] text-[#5a5a55]'
        )}>
          {peer.initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-medium text-black">{peer.name}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className={cn('w-[4px] h-[4px] rounded-full flex-shrink-0', peer.connected ? 'bg-[#22c55e]' : 'bg-[#d0d0cc]')} />
            <span className="text-[10px] font-mono font-light text-[#a0a09a]">
              {peer.connected
                ? `WebRTC · direct${peer.pingMs != null ? ` · ${peer.pingMs}ms` : ''}`
                : 'connecting…'}
            </span>
          </div>
        </div>
        <SignalBars pingMs={peer.pingMs} />
      </button>

      {/* Call shortcuts — only when connected */}
      {peer.connected && (
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={onVoice}
            title="Voice call"
            className="w-8 h-8 rounded-[9px] flex items-center justify-center hover:bg-[#f0f0ee] active:bg-[#e8e8e4] transition-colors"
          >
            <svg className="w-[15px] h-[15px] stroke-[#5a5a55]" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          </button>
          <button
            onClick={onVideo}
            title="Video call"
            className="w-8 h-8 rounded-[9px] flex items-center justify-center hover:bg-[#f0f0ee] active:bg-[#e8e8e4] transition-colors"
          >
            <svg className="w-[15px] h-[15px] stroke-[#5a5a55]" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <polygon points="23 7 16 12 23 17 23 7"/>
              <rect x="1" y="5" width="15" height="14" rx="2"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

export function PeersScreen() {
  const peers         = useNexusStore(selectPeerList);
  const setActivePeer = useNexusStore(s => s.setActivePeer);
  const setScreen     = useNexusStore(s => s.setScreen);
  const startCall     = useNexusStore(s => s.startCall);
  const myId          = useNexusStore(s => s.myId);

  const openChat = (id: string) => {
    setActivePeer(id);
    setScreen('chat');
  };

  const callPeer = async (id: string, kind: 'voice' | 'video') => {
    setActivePeer(id);
    setScreen('chat');
    try { await startCall(id, kind); } catch {}
  };

  const copyInvite = () => {
    const connectUrl = `${window.location.origin}${window.location.pathname}?connect=${myId}`;
    navigator.clipboard.writeText(connectUrl)
      .then(() => toast.success('Invite link copied!'))
      .catch(() => toast.error('Could not copy link'));
  };

  const connected = peers.filter(p => p.connected).length;

  return (
    <div className="flex flex-col h-full bg-[#fafaf9]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#ebebea] shrink-0 bg-white">
        <h2 className="text-[16px] font-semibold text-black">Nearby Peers</h2>
        <span className="text-[11.5px] font-mono font-medium text-[#22c55e]">
          {connected} online
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scroll-touch">
        {peers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-5 px-8 text-center select-none">
            <div className="relative w-20 h-20 flex items-center justify-center">
              {/* Radar scanner visual */}
              <div className="absolute inset-0 rounded-full border border-black/5 animate-ping-slow pointer-events-none" />
              <div className="absolute inset-2 rounded-full border border-black/10 animate-pulse-slow pointer-events-none" />
              <div className="w-12 h-12 rounded-full bg-white border border-[#ebebea] shadow-sm flex items-center justify-center text-black z-10">
                <svg className="w-5 h-5 stroke-current fill-none animate-pulse-slow" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
            </div>
            <div className="space-y-1.5 max-w-xs">
              <h3 className="text-[15px] font-semibold text-black leading-snug">No peers found nearby</h3>
              <p className="text-[12px] font-mono font-light text-[#9a9a94] leading-relaxed">
                Open Nexus on another device connected to the same Wi-Fi, or share your invite link.
              </p>
            </div>
            <button
              onClick={copyInvite}
              className="mt-2 flex items-center gap-2 px-5 py-2.5 rounded-full bg-black hover:bg-black/90 active:scale-95 text-white text-[12px] font-medium transition-all shadow-sm cursor-pointer"
            >
              <svg className="w-3.5 h-3.5 stroke-white fill-none" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="18" cy="5" r="3"/>
                <circle cx="6" cy="12" r="3"/>
                <circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
              Copy Invite Link
            </button>
          </div>
        ) : (
          <div className="bg-white">
            {peers.map(peer => (
              <PeerRow
                key={peer.id}
                peer={peer}
                onChat={()  => openChat(peer.id)}
                onVoice={() => callPeer(peer.id, 'voice')}
                onVideo={() => callPeer(peer.id, 'video')}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
