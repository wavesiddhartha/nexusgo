'use client';

import { useEffect } from 'react';
import { useNexusStore } from '@/store/nexus.store';
import { AppShell }      from '@/components/layout/AppShell';

export default function Page() {
  const initManager = useNexusStore(s => s.initManager);
  const connectTo   = useNexusStore(s => s.connectToPeer);

  useEffect(() => {
    // 1 ── Register service worker (push + offline cache)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(reg => {
          console.log('[sw] registered', reg.scope);
          // Listen for messages from SW (notification clicks, push resubscribe)
          navigator.serviceWorker.addEventListener('message', ev => {
            const { type, notifType } = ev.data ?? {};
            if (type === 'notification-click') {
              const store = useNexusStore.getState();
              if (notifType === 'call') store.setScreen('chat');
              else                      store.setScreen('chat');
            }
            if (type === 'push-resubscribe') {
              useNexusStore.getState().enablePush();
            }
          });
        })
        .catch(err => console.warn('[sw] registration failed', err));
    }

    // 2 ── Initialise WebRTC manager + signaling connection
    const sigUrl = process.env.NEXT_PUBLIC_SIGNALING_URL ?? 'ws://localhost:8787';
    initManager(sigUrl);

    // 3 ── Auto-connect from URL param  (?connect=<peerId>)
    const params  = new URLSearchParams(window.location.search);
    const peerId  = params.get('connect');
    if (peerId) {
      // Small delay so manager has time to register
      const t = setTimeout(() => connectTo(peerId), 1800);
      // Clean the URL
      window.history.replaceState({}, '', window.location.pathname);
      return () => clearTimeout(t);
    }
  // initManager and connectTo are stable references from zustand
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <AppShell />;
}
