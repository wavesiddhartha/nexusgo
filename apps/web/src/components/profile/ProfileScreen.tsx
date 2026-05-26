'use client';

import { useRef, useState, useCallback } from 'react';
import { useNexusStore, selectConnected } from '@/store/nexus.store';
import { useQRCode } from '@/hooks';
import { formatBytes } from '@nexus/shared';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={cn('w-9 h-5 rounded-full relative transition-colors duration-200 shrink-0', on ? 'bg-[#080808]' : 'bg-[#e0e0dc]')}
    >
      <div className={cn(
        'absolute top-[3px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-[left] duration-200',
        on ? 'left-[19px]' : 'left-[3px]'
      )} />
    </button>
  );
}

export function ProfileScreen() {
  const myId        = useNexusStore(s => s.myId);
  const myName      = useNexusStore(s => s.myName);
  const setName     = useNexusStore(s => s.setName);
  const connectTo   = useNexusStore(s => s.connectToPeer);
  const stats       = useNexusStore(s => s.stats);
  const peerCount   = useNexusStore(selectConnected);
  const pushEnabled = useNexusStore(s => s.pushEnabled);
  const enablePush  = useNexusStore(s => s.enablePush);
  const soundsEnabled = useNexusStore(s => s.soundsEnabled);
  const toggleSounds  = useNexusStore(s => s.toggleSounds);
  const privacyMode   = useNexusStore(s => s.privacyMode);
  const togglePrivacy = useNexusStore(s => s.togglePrivacy);

  const [editing,       setEditing]       = useState(false);
  const [nameVal,       setNameVal]       = useState(myName);
  const [connectId,     setConnectId]     = useState('');
  const [enablingPush,  setEnablingPush]  = useState(false);
  const [discoverOn,    setDiscoverOn]    = useState(true);
  const [autoClear,     setAutoClear]     = useState(false);

  const qrRef = useRef<HTMLCanvasElement>(null);

  const connectUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}?connect=${myId}`
    : '';

  useQRCode(connectUrl, qrRef);

  const saveEdit = useCallback(() => {
    const v = nameVal.trim();
    if (v && v !== myName) setName(v);
    else setNameVal(myName);
    setEditing(false);
  }, [nameVal, myName, setName]);

  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(connectUrl)
      .then(() => toast('Invite link copied!'))
      .catch(() => {
        // Fallback for browsers without clipboard API
        const ta = document.createElement('textarea');
        ta.value = connectUrl;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        toast('Link copied!');
      });
  }, [connectUrl]);

  const handleConnect = useCallback(() => {
    const v = connectId.trim();
    if (!v) { toast.error('Enter a peer ID'); return; }
    connectTo(v);
    setConnectId('');
    toast('Connecting…');
  }, [connectId, connectTo]);

  const handleEnablePush = async () => {
    setEnablingPush(true);
    const ok = await enablePush();
    setEnablingPush(false);
    if (ok) toast('Push notifications enabled!');
    else    toast.error('Could not enable — check browser permissions');
  };

  const myIni = myName
    ? (myName.split(/\s+/).length > 1
        ? (myName.split(/\s+/)[0][0] + myName.split(/\s+/).pop()![0]).toUpperCase()
        : myName.slice(0, 2).toUpperCase())
    : '—';

  return (
    <div className="overflow-y-auto scroll-touch h-full">
      <div
        className="px-5 py-6 max-w-lg mx-auto space-y-4"
        style={{ paddingBottom: 'calc(24px + var(--safe-bottom))' }}
      >

        {/* ── Identity card ─────────────────────────────────────── */}
        <div className="bg-[#f9f9f8] border border-[#e8e8e4] rounded-[20px] p-6 flex flex-col items-center gap-3 text-center">
          <div className="w-[68px] h-[68px] rounded-full bg-[#080808] text-white flex items-center justify-center text-[22px] font-medium shadow-[0_4px_20px_rgba(8,8,8,0.18)]">
            {myIni}
          </div>

          {editing ? (
            <input
              autoFocus
              value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              onBlur={saveEdit}
              onKeyDown={e => {
                if (e.key === 'Enter') saveEdit();
                if (e.key === 'Escape') { setEditing(false); setNameVal(myName); }
              }}
              className="text-[18px] font-medium text-center bg-transparent border-b border-[#c0c0bc] focus:border-black pb-0.5 w-56"
              style={{ outline: 'none' }}
              maxLength={48}
            />
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[18px] font-medium text-black">{myName || '—'}</span>
              <button
                onClick={() => { setEditing(true); setNameVal(myName); }}
                className="text-[10px] font-mono font-light text-[#a0a09a] hover:text-black transition-colors"
              >
                edit
              </button>
            </div>
          )}

          <div className="text-[10px] font-mono font-light text-[#a0a09a]">
            nexus_{myId.slice(0, 8)}
          </div>
          <div className="text-[10px] font-mono font-light text-[#b0b0a8] bg-[#f0f0ee] rounded-[8px] px-3 py-1.5 w-full truncate">
            {myId || '—'}
          </div>
        </div>

        {/* ── Push notification banner ─────────────────────────── */}
        {!pushEnabled ? (
          <div className="bg-[#eff6ff] border border-[#bfdbfe] rounded-[16px] p-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-[#dbeafe] flex items-center justify-center shrink-0 mt-0.5">
              <svg className="w-4 h-4 stroke-[#2563eb]" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-[13px] font-medium text-[#1e3a8a]">Enable Push Notifications</p>
              <p className="text-[11px] font-mono font-light text-[#1d4ed8] mt-0.5 leading-relaxed">
                Get notified when someone messages or calls you — even when the tab is closed.
              </p>
              <button
                onClick={handleEnablePush}
                disabled={enablingPush}
                className="mt-3 px-4 py-1.5 bg-[#2563eb] text-white rounded-full text-[11px] font-medium active:opacity-70 disabled:opacity-50 transition-opacity"
              >
                {enablingPush ? 'Enabling…' : 'Enable now'}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-[16px] px-4 py-3 flex items-center gap-3">
            <svg className="w-4 h-4 stroke-[#16a34a] shrink-0" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <span className="text-[12px] font-mono font-light text-[#15803d]">Push notifications active</span>
          </div>
        )}

        {/* ── QR code ──────────────────────────────────────────── */}
        <div className="border border-[#e8e8e4] rounded-[20px] p-5 flex flex-col items-center gap-3 bg-white">
          <p className="text-[9px] font-mono font-light text-[#b0b0a8] uppercase tracking-widest">Your QR Code</p>
          <canvas ref={qrRef} className="rounded-[10px]" />
          <p className="text-[10px] font-mono font-light text-[#a0a09a] text-center leading-relaxed">
            Anyone scans this to connect instantly.<br />No account. No login.
          </p>
          <button
            onClick={copyLink}
            className="px-5 py-2 bg-[#080808] text-white rounded-full text-[12px] font-medium active:opacity-70 transition-opacity"
          >
            Copy invite link
          </button>
        </div>

        {/* ── Manual connect ───────────────────────────────────── */}
        <div>
          <p className="text-[9px] font-mono font-light text-[#b0b0a8] uppercase tracking-widest mb-2.5">
            Connect by ID
          </p>
          <div className="flex gap-2">
            <input
              value={connectId}
              onChange={e => setConnectId(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleConnect(); }}
              placeholder="Paste peer ID or invite link…"
              className="flex-1 px-3.5 py-2.5 border border-[#e4e4e0] rounded-[12px] text-[12px] font-mono font-light bg-[#f9f9f8] placeholder-[#c8c8c2] text-black"
              style={{ outline: 'none' }}
            />
            <button
              onClick={handleConnect}
              className="px-4 py-2.5 bg-[#080808] text-white rounded-[12px] text-[12px] font-medium whitespace-nowrap active:opacity-70 transition-opacity"
            >
              Connect
            </button>
          </div>
        </div>

        {/* ── Stats ────────────────────────────────────────────── */}
        <div>
          <p className="text-[9px] font-mono font-light text-[#b0b0a8] uppercase tracking-widest mb-2.5">Session</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { val: peerCount,                      label: 'peers online' },
              { val: stats.msgsSent,                 label: 'messages sent' },
              { val: stats.filesShared,              label: 'files shared' },
              { val: stats.callsTotal,               label: 'calls made' },
              { val: formatBytes(stats.bytesShared), label: 'data transferred', wide: true },
            ].map(({ val, label, wide }) => (
              <div
                key={label}
                className={cn('bg-[#f9f9f8] border border-[#ebebea] rounded-[14px] p-3.5', wide && 'col-span-2')}
              >
                <div className="text-[20px] font-medium text-black">{val}</div>
                <div className="text-[10px] font-mono font-light text-[#a0a09a] mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Settings ─────────────────────────────────────────── */}
        <div>
          <p className="text-[9px] font-mono font-light text-[#b0b0a8] uppercase tracking-widest mb-2.5">
            Privacy & Security
          </p>
          <div className="bg-[#f9f9f8] border border-[#ebebea] rounded-[18px] overflow-hidden divide-y divide-[#f0f0ee]">
            {/* Encryption — always on */}
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="w-8 h-8 rounded-[8px] bg-white border border-[#ebebea] flex items-center justify-center shrink-0">
                <svg className="w-[14px] h-[14px] stroke-[#5a5a55]" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <rect x="3" y="11" width="18" height="11" rx="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-[13px] font-medium text-black">End-to-end encryption</div>
                <div className="text-[10px] font-mono font-light text-[#a0a09a] mt-0.5">WebRTC DTLS · always on</div>
              </div>
              <span className="text-[10px] font-mono font-light text-[#22c55e]">on</span>
            </div>

            {[
              { icon: 'wifi',    label: 'Discovery broadcast', sub: 'Appear to nearby peers',    val: discoverOn,    set: setDiscoverOn },
              { icon: 'trash',   label: 'Auto-clear messages', sub: 'Delete after session ends', val: autoClear,     set: setAutoClear  },
              { icon: 'speaker', label: 'Synthesized sounds',  sub: 'Ambient UI sound chimes',   val: soundsEnabled, set: toggleSounds  },
              { icon: 'wifi',    label: 'TURN Privacy Mode',   sub: 'Route all traffic via TURN',val: privacyMode,   set: togglePrivacy },
            ].map(({ icon, label, sub, val, set }) => (
              <div key={label} className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-8 h-8 rounded-[8px] bg-white border border-[#ebebea] flex items-center justify-center shrink-0">
                  <SettingIcon type={icon} />
                </div>
                <div className="flex-1">
                  <div className="text-[13px] font-medium text-black">{label}</div>
                  <div className="text-[10px] font-mono font-light text-[#a0a09a] mt-0.5">{sub}</div>
                </div>
                <Toggle on={val} onChange={set} />
              </div>
            ))}
          </div>
        </div>

        {/* ── About ────────────────────────────────────────────── */}
        <div>
          <p className="text-[9px] font-mono font-light text-[#b0b0a8] uppercase tracking-widest mb-2.5">About</p>
          <div className="bg-[#f9f9f8] border border-[#ebebea] rounded-[18px] overflow-hidden divide-y divide-[#f0f0ee]">
            {[
              { label: 'App',      val: 'NEXUS'               },
              { label: 'Version',  val: '2.0.0'               },
              { label: 'Protocol', val: 'WebRTC DataChannel'  },
              { label: 'Domain',   val: 'nexusgo.me'          },
              { label: 'Contact',  val: 'mail@nexusgo.me'     },
            ].map(({ label, val }) => (
              <div key={label} className="flex items-center justify-between px-4 py-3">
                <span className="text-[13px] text-black">{label}</span>
                <span className="text-[11px] font-mono font-light text-[#a0a09a]">{val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Copyright Footer ─────────────────────────────────── */}
        <div className="text-center pt-4 pb-2 space-y-3 flex flex-col items-center">
          <div className="space-y-1">
            <p className="text-[11px] font-mono font-light text-[#a0a09a]">
              NEXUS &copy; 2026 &middot; nexusgo.me
            </p>
            <p className="text-[11px] font-mono font-light text-[#a0a09a]">
              Created by Siddhartha Sahani
            </p>
            <p className="text-[10px] font-mono font-light text-[#b0b0a8]">
              mail@nexusgo.me
            </p>
          </div>
          <div className="pt-2">
            <a href="https://www.producthunt.com/products/nexus-25?embed=true&amp;utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=badge-nexus-038c6965-df91-47e4-900f-5e1515d2d940" target="_blank" rel="noopener noreferrer">
              <img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1156697&amp;theme=dark&amp;t=1779831018428" alt="NEXUS - Instant P2P chat, calls &amp; file sharing. Zero setup &amp; cloud. | Product Hunt" width="250" height="54" className="mx-auto" />
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}

function SettingIcon({ type }: { type: string }) {
  const p = {
    fill: 'none', strokeWidth: '1.5',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: 'w-[14px] h-[14px] stroke-[#5a5a55]',
    viewBox: '0 0 24 24',
  };
  switch (type) {
    case 'wifi':    return <svg {...p}><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>;
    case 'trash':   return <svg {...p}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>;
    case 'speaker': return <svg {...p}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>;
    default:        return null;
  }
}
