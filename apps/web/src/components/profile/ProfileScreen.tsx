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
      className={cn(
        'w-9.5 h-5.5 rounded-full relative transition-colors duration-300 shrink-0 ease-in-out',
        on ? 'bg-[#080808] ring-1 ring-[#080808]/10' : 'bg-[#e4e4e0] ring-1 ring-black/5'
      )}
    >
      <div className={cn(
        'absolute top-[2.5px] w-4.5 h-4.5 rounded-full bg-white shadow-md transition-all duration-300 ease-out',
        on ? 'left-[18px]' : 'left-[3px]'
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
      .then(() => toast.success('Invite link copied!'))
      .catch(() => {
        // Fallback for browsers without clipboard API
        const ta = document.createElement('textarea');
        ta.value = connectUrl;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        toast.success('Link copied!');
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
    if (ok) toast.success('Push notifications enabled!');
    else    toast.error('Could not enable — check browser permissions');
  };

  const myIni = myName
    ? (myName.split(/\s+/).length > 1
        ? (myName.split(/\s+/)[0][0] + myName.split(/\s+/).pop()![0]).toUpperCase()
        : myName.slice(0, 2).toUpperCase())
    : '—';

  return (
    <div className="overflow-y-auto scroll-touch h-full bg-[#fcfcfb]">
      <div
        className="px-5 py-6 max-w-lg mx-auto space-y-6"
        style={{ paddingBottom: 'calc(40px + var(--safe-bottom))' }}
      >

        {/* ── Identity card ─────────────────────────────────────── */}
        <div className="bg-white border border-[#f0f0ed] shadow-[0_2px_8px_rgba(0,0,0,0.02)] rounded-[24px] p-6 flex flex-col items-center gap-4 text-center">
          <div className="relative group">
            <div className="w-[80px] h-[80px] rounded-full bg-[#080808] text-white flex items-center justify-center text-[26px] font-semibold shadow-[0_8px_30px_rgba(8,8,8,0.15)] ring-4 ring-[#f4f4f2]/40 transition-all duration-300">
              {myIni}
            </div>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-white shadow-sm flex items-center justify-center">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            </div>
          </div>

          <div className="space-y-1">
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
                className="text-[20px] font-semibold text-center bg-transparent border-b-2 border-black/10 focus:border-black pb-0.5 w-60 text-black transition-all"
                style={{ outline: 'none' }}
                maxLength={48}
              />
            ) : (
              <div className="flex items-center justify-center gap-2 group">
                <span className="text-[20px] font-semibold text-black tracking-tight">{myName || '—'}</span>
                <button
                  onClick={() => { setEditing(true); setNameVal(myName); }}
                  className="p-1 rounded-md text-[#a0a09a] hover:text-black hover:bg-[#f0f0ee] transition-all"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                  </svg>
                </button>
              </div>
            )}
            <div className="text-[10px] font-mono font-light text-[#b0b0a8] select-all cursor-pointer bg-[#f8f8f6] rounded-[8px] px-3 py-1.5 max-w-[280px] mx-auto truncate transition-colors hover:bg-[#f0f0ed]" onClick={() => {
              navigator.clipboard.writeText(myId);
              toast.success('Full Peer ID copied!');
            }}>
              ID: {myId.slice(0, 16)}...
            </div>
          </div>
        </div>

        {/* ── Push notification banner ─────────────────────────── */}
        {!pushEnabled ? (
          <div className="bg-[#eff6ff] border border-[#dbeafe] rounded-[20px] p-5 flex items-start gap-4 shadow-[0_4px_12px_rgba(37,99,235,0.03)] animate-fadeIn">
            <div className="w-10 h-10 rounded-xl bg-blue-100/80 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 stroke-[#2563eb]" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
            </div>
            <div className="flex-1 space-y-1.5">
              <p className="text-[13px] font-semibold text-[#1e3a8a] leading-tight">Enable Push Notifications</p>
              <p className="text-[11.5px] font-sans text-[#3b82f6] leading-relaxed">
                Get notified when someone messages or calls you — even when the tab is closed.
              </p>
              <button
                onClick={handleEnablePush}
                disabled={enablingPush}
                className="px-4 py-1.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-full text-[11px] font-medium active:scale-95 disabled:opacity-50 transition-all cursor-pointer shadow-sm shadow-blue-500/10"
              >
                {enablingPush ? 'Enabling…' : 'Enable now'}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-[#f0fdf4] border border-[#dcfce7] rounded-[20px] px-5 py-3.5 flex items-center gap-3 shadow-[0_2px_8px_rgba(22,163,74,0.02)]">
            <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 stroke-[#16a34a]" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <span className="text-[12px] font-medium text-[#15803d]">Push notifications active</span>
          </div>
        )}

        {/* ── QR code ──────────────────────────────────────────── */}
        <div className="border border-[#f0f0ed] rounded-[24px] p-6 flex flex-col items-center gap-4 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
          <div className="flex flex-col items-center gap-1">
            <span className="text-[9px] font-mono font-bold text-[#b0b0a8] uppercase tracking-widest">Share Profile</span>
            <h3 className="text-[14px] font-semibold text-black">Instant Connect QR</h3>
          </div>
          <div className="bg-[#fafaf9] p-4 rounded-[18px] border border-[#f0f0ed] shadow-inner">
            <canvas ref={qrRef} className="rounded-[10px]" />
          </div>
          <p className="text-[11.5px] font-sans text-[#a0a09a] text-center leading-relaxed max-w-[280px]">
            Anyone scans this to connect instantly. No cloud, no passwords, completely peer-to-peer.
          </p>
          <button
            onClick={copyLink}
            className="w-full py-3 bg-[#080808] hover:bg-black text-white rounded-[14px] text-[13px] font-semibold active:scale-[0.98] transition-all shadow-sm"
          >
            Copy invite link
          </button>
        </div>

        {/* ── Manual connect ───────────────────────────────────── */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-[#b0b0a8] uppercase tracking-wider px-1">
            Connect by ID
          </p>
          <div className="flex gap-2">
            <input
              value={connectId}
              onChange={e => setConnectId(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleConnect(); }}
              placeholder="Paste peer ID or invite link…"
              className="flex-1 px-4 py-3 border border-[#f0f0ed] rounded-[14px] text-[13px] font-mono bg-white placeholder-[#c8c8c2] text-black focus:border-black transition-colors"
              style={{ outline: 'none' }}
            />
            <button
              onClick={handleConnect}
              className="px-5 py-3 bg-[#080808] hover:bg-black text-white rounded-[14px] text-[13px] font-semibold whitespace-nowrap active:scale-[0.97] transition-all shadow-sm"
            >
              Connect
            </button>
          </div>
        </div>

        {/* ── Stats ────────────────────────────────────────────── */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-[#b0b0a8] uppercase tracking-wider px-1">Session stats</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { val: peerCount,                      label: 'peers online', icon: 'people' },
              { val: stats.msgsSent,                 label: 'messages sent', icon: 'chat' },
              { val: stats.filesShared,              label: 'files shared', icon: 'file' },
              { val: stats.callsTotal,               label: 'calls made', icon: 'phone' },
              { val: formatBytes(stats.bytesShared), label: 'data transferred', wide: true, icon: 'data' },
            ].map(({ val, label, wide, icon }) => (
              <div
                key={label}
                className={cn('bg-white border border-[#f0f0ed] shadow-[0_2px_6px_rgba(0,0,0,0.01)] rounded-[18px] p-4 flex flex-col justify-between min-h-[92px]', wide && 'col-span-2')}
              >
                <div className="flex items-center justify-between">
                  <div className="text-[22px] font-semibold text-black tracking-tight">{val}</div>
                  <div className="w-7 h-7 rounded-lg bg-[#fafaf9] flex items-center justify-center border border-[#f4f4f2]">
                    <StatIcon type={icon} />
                  </div>
                </div>
                <div className="text-[11px] font-mono font-medium text-[#a0a09a] uppercase tracking-wide mt-2">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Settings ─────────────────────────────────────────── */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-[#b0b0a8] uppercase tracking-wider px-1">
            Privacy & Security
          </p>
          <div className="bg-white border border-[#f0f0ed] shadow-[0_2px_8px_rgba(0,0,0,0.02)] rounded-[22px] overflow-hidden divide-y divide-[#fafaf9]">
            {/* Encryption — always on */}
            <div className="flex items-center gap-3 px-4.5 py-4">
              <div className="w-8.5 h-8.5 rounded-xl bg-green-50 border border-[#dcfce7] flex items-center justify-center shrink-0">
                <svg className="w-[15px] h-[15px] stroke-[#16a34a]" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <rect x="3" y="11" width="18" height="11" rx="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-[13.5px] font-medium text-black">End-to-end encryption</div>
                <div className="text-[10.5px] font-mono font-light text-[#a0a09a] mt-0.5">WebRTC DTLS · always active</div>
              </div>
              <span className="text-[10.5px] font-mono font-bold text-[#16a34a] bg-green-50 border border-green-100 rounded-[6px] px-2 py-0.5">ON</span>
            </div>

            {[
              { icon: 'wifi',    label: 'Discovery broadcast', sub: 'Appear to nearby peers',    val: discoverOn,    set: setDiscoverOn },
              { icon: 'trash',   label: 'Auto-clear messages', sub: 'Delete after session ends', val: autoClear,     set: setAutoClear  },
              { icon: 'speaker', label: 'Synthesized sounds',  sub: 'Ambient UI sound chimes',   val: soundsEnabled, set: toggleSounds  },
              { icon: 'shield',  label: 'TURN Privacy Mode',   sub: 'Route all traffic via TURN',val: privacyMode,   set: togglePrivacy },
            ].map(({ icon, label, sub, val, set }) => (
              <div key={label} className="flex items-center gap-3 px-4.5 py-4">
                <div className="w-8.5 h-8.5 rounded-xl bg-[#fafaf9] border border-[#f0f0ed] flex items-center justify-center shrink-0">
                  <SettingIcon type={icon} />
                </div>
                <div className="flex-1">
                  <div className="text-[13.5px] font-medium text-black">{label}</div>
                  <div className="text-[10.5px] font-mono font-light text-[#a0a09a] mt-0.5">{sub}</div>
                </div>
                <Toggle on={val} onChange={set} />
              </div>
            ))}
          </div>
        </div>

        {/* ── About ────────────────────────────────────────────── */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-[#b0b0a8] uppercase tracking-wider px-1">About</p>
          <div className="bg-white border border-[#f0f0ed] shadow-[0_2px_8px_rgba(0,0,0,0.02)] rounded-[22px] overflow-hidden divide-y divide-[#fafaf9]">
            {[
              { label: 'App',      val: 'NEXUS'               },
              { label: 'Version',  val: '2.0.0'               },
              { label: 'Protocol', val: 'WebRTC DataChannel'  },
              { label: 'Domain',   val: 'nexusgo.me'          },
              { label: 'Contact',  val: 'mail@nexusgo.me'     },
            ].map(({ label, val }) => (
              <div key={label} className="flex items-center justify-between px-4.5 py-3.5">
                <span className="text-[13px] font-medium text-black">{label}</span>
                <span className="text-[11.5px] font-mono font-light text-[#a0a09a]">{val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Copyright Footer ─────────────────────────────────── */}
        <div className="text-center pt-6 pb-2 space-y-4 flex flex-col items-center border-t border-[#f0f0ed]">
          <div className="space-y-1 select-none">
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
          <div className="pt-1.5">
            <a href="https://www.producthunt.com/products/nexus-25?embed=true&amp;utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=badge-nexus-038c6965-df91-47e4-900f-5e1515d2d940" target="_blank" rel="noopener noreferrer">
              <img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1156697&amp;theme=dark&amp;t=1779831018428" alt="NEXUS - Instant P2P chat, calls &amp; file sharing. Zero setup &amp; cloud. | Product Hunt" width="250" height="54" className="mx-auto hover:opacity-90 active:scale-95 transition-all" />
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}

function StatIcon({ type }: { type: string }) {
  const p = {
    fill: 'none', strokeWidth: '1.5',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: 'w-3.5 h-3.5 stroke-[#5a5a55]',
    viewBox: '0 0 24 24',
  };
  switch (type) {
    case 'people': return <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
    case 'chat':   return <svg {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
    case 'file':   return <svg {...p}><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>;
    case 'phone':  return <svg {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
    case 'data':   return <svg {...p}><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
    default:       return null;
  }
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
    case 'shield':  return <svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
    default:        return null;
  }
}
