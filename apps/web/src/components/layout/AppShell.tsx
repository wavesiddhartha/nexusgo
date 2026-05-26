'use client';

import { useNexusStore, selectConnected, selectTotalUnread, selectRoomList } from '@/store/nexus.store';
import { DiscoverScreen } from '@/components/discover/DiscoverScreen';
import { PeersScreen }    from '@/components/peers/PeersScreen';
import { ChatScreen }     from '@/components/chat/ChatScreen';
import { GroupsScreen }   from '@/components/groups/GroupsScreen';
import { ProfileScreen }  from '@/components/profile/ProfileScreen';
import { CallOverlay }    from '@/components/calls/CallOverlay';
import { cn } from '@/lib/utils';
import type { Screen } from '@/store/nexus.store';

// ── Nav icons ─────────────────────────────────────────────────────────────────
const NavIcon = ({ type, active }: { type: Screen; active: boolean }) => {
  const cls = cn('w-[19px] h-[19px] transition-colors duration-200', active ? 'stroke-[#080808]' : 'stroke-[#b8b8b0]');
  const base = { fill: 'none', strokeWidth: '1.4', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24', className: cls };
  switch (type) {
    case 'discover': return <svg {...base}><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/></svg>;
    case 'peers':    return <svg {...base}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
    case 'chat':     return <svg {...base}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
    case 'groups':   return <svg {...base}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="17" y1="11" x2="23" y2="11"/></svg>;
    case 'profile':  return <svg {...base}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
    default:         return null;
  }
};

export function AppShell() {
  const activeScreen = useNexusStore(s => s.activeScreen);
  const setScreen    = useNexusStore(s => s.setScreen);
  const wsConnected  = useNexusStore(s => s.wsConnected);
  const myName       = useNexusStore(s => s.myName);
  const peerCount    = useNexusStore(selectConnected);
  const unreadTotal  = useNexusStore(selectTotalUnread);
  const rooms        = useNexusStore(selectRoomList);
  const activeCall   = useNexusStore(s => s.activeCall);
  const groupUnread  = useNexusStore(s => Object.values(s.groupUnread).reduce((a, b) => a + b, 0));

  const navItems: { key: Screen; label: string; badge?: boolean }[] = [
    { key: 'discover', label: 'Discover' },
    { key: 'peers',    label: 'Peers',   badge: peerCount > 0 },
    { key: 'chat',     label: 'Chat',    badge: unreadTotal > 0 },
    { key: 'groups',   label: 'Groups',  badge: groupUnread > 0 },
    { key: 'profile',  label: 'Profile' },
  ];

  const screens: [Screen, React.ReactNode][] = [
    ['discover', <DiscoverScreen />],
    ['peers',    <PeersScreen />],
    ['chat',     <ChatScreen />],
    ['groups',   <GroupsScreen />],
    ['profile',  <ProfileScreen />],
  ];

  return (
    <div className="flex flex-col bg-white" style={{ height: '100dvh' }}>

      {/* ── Topbar ── */}
      <header
        className="flex items-center gap-3 px-4 bg-white border-b border-[#ebebea] shrink-0"
        style={{ height: 52, paddingTop: 'var(--safe-top)' }}
      >
        <span className="text-[11px] font-medium tracking-[0.24em] uppercase text-black select-none">Nexus</span>
        <div className="w-px h-3 bg-[#e0e0dc]" />
        <div className="flex items-center gap-1.5">
          <div className={cn(
            'w-[5px] h-[5px] rounded-full shrink-0',
            wsConnected ? 'bg-[#22c55e] live-dot' : 'bg-[#d0d0cc] live-dot'
          )} />
          <span className="text-[11px] font-mono font-light text-[#8a8a84]">
            {wsConnected
              ? `${peerCount} peer${peerCount !== 1 ? 's' : ''}${rooms.length > 0 ? ` · ${rooms.length} room${rooms.length !== 1 ? 's' : ''}` : ''}`
              : 'connecting…'}
          </span>
        </div>

        <div className="flex-1" />

        {/* In-call pill */}
        {activeCall && (
          <button
            onClick={() => setScreen('chat')}
            className="flex items-center gap-1.5 px-2.5 py-[5px] rounded-full bg-[#f0fdf4] border border-[#bbf7d0]"
          >
            <div className="w-[5px] h-[5px] rounded-full bg-[#22c55e] animate-pulse" />
            <span className="text-[10px] font-mono font-light text-[#15803d]">
              {activeCall.state === 'active' ? 'In call' : activeCall.state === 'ringing-in' ? '📞 Incoming' : 'Calling…'}
            </span>
          </button>
        )}

        {/* Identity pill */}
        <button
          onClick={() => setScreen('profile')}
          className="flex items-center gap-1.5 px-2.5 py-[5px] rounded-full border border-[#e8e8e4] hover:border-[#c0c0bc] active:border-[#080808] transition-colors duration-150"
        >
          <svg className="w-[10px] h-[10px] stroke-[#9a9a94] shrink-0" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <span className="text-[10px] font-mono font-light text-[#7a7a74] max-w-[90px] truncate">{myName || '—'}</span>
        </button>
      </header>

      {/* ── Screens ── */}
      <main className="flex-1 overflow-hidden relative">
        {screens.map(([key, el]) => (
          <div
            key={key}
            className={cn(
              'absolute inset-0 flex flex-col',
              activeScreen === key ? 'flex' : 'hidden'
            )}
          >
            {el}
          </div>
        ))}
      </main>

      {/* ── Bottom nav ── */}
      <nav
        className="flex border-t border-[#ebebea] bg-white shrink-0"
        style={{ paddingBottom: 'var(--safe-bottom)' }}
      >
        {navItems.map(({ key, label, badge }) => {
          const active = activeScreen === key;
          return (
            <button
              key={key}
              onClick={() => setScreen(key)}
              className="flex-1 flex flex-col items-center justify-center pt-2.5 pb-1.5 relative min-w-0"
            >
              <NavIcon type={key} active={active} />
              <span className={cn(
                'text-[9px] font-mono font-light tracking-wider mt-1 transition-colors duration-200',
                active ? 'text-[#080808]' : 'text-[#b8b8b0]'
              )}>
                {label}
              </span>
              {/* Active indicator dot */}
              {active && <div className="w-[3px] h-[3px] rounded-full bg-[#080808] mt-1" />}
              {/* Unread badge */}
              {badge && !active && (
                <div className="absolute top-2 right-[calc(50%-10px)] w-[5px] h-[5px] rounded-full bg-[#080808]" />
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Global call overlay ── */}
      <CallOverlay />
    </div>
  );
}
