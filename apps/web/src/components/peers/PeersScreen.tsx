'use client';

import { useNexusStore, selectPeerList } from '@/store/nexus.store';
import { cn } from '@/lib/utils';
import type { RemotePeer } from '@/lib/webrtc-manager';

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

  const openChat = (id: string) => {
    setActivePeer(id);
    setScreen('chat');
  };

  const callPeer = async (id: string, kind: 'voice' | 'video') => {
    setActivePeer(id);
    setScreen('chat');
    try { await startCall(id, kind); } catch {}
  };

  const connected = peers.filter(p => p.connected).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#ebebea] shrink-0">
        <h2 className="text-[16px] font-medium text-black">Nearby Peers</h2>
        <span className="text-[11px] font-mono font-light text-[#a0a09a]">
          {connected} online
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scroll-touch">
        {peers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center">
            <svg className="w-10 h-10 stroke-[#deded8]" fill="none" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"/>
              <path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.38c-3.72 4.35-8.94 5.7-16.88 5.85m19.5 1.9c-3.5-.93-6.63-.82-8.94 0-2.58.92-5.01 2.86-7.44 6.32"/>
            </svg>
            <div>
              <p className="text-[14px] font-medium text-[#5a5a55]">No peers yet</p>
              <p className="text-[11px] font-mono font-light text-[#a0a09a] mt-1 leading-relaxed">
                Open nexusgo.me on another device,<br />or share your invite link from Profile
              </p>
            </div>
          </div>
        ) : (
          peers.map(peer => (
            <PeerRow
              key={peer.id}
              peer={peer}
              onChat={()  => openChat(peer.id)}
              onVoice={() => callPeer(peer.id, 'voice')}
              onVideo={() => callPeer(peer.id, 'video')}
            />
          ))
        )}
      </div>
    </div>
  );
}
