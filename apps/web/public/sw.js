/**
 * NEXUS Service Worker v2
 * ────────────────────────
 * • Web Push notification delivery (messages, calls, files, groups)
 * • Offline-capable app shell caching
 * • Notification action handling (Answer / Decline / Open)
 * • Push subscription change handling (auto re-subscribe)
 */

const CACHE_NAME   = 'nexus-shell-v2';
const SHELL_ASSETS = ['/'];

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch — network first, fall back to cache ──────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;

  // Never intercept WebSocket upgrades, API calls, or cross-origin
  if (
    request.method !== 'GET'              ||
    request.url.includes('/_next/')       ||
    !request.url.startsWith(self.location.origin)
  ) return;

  event.respondWith(
    fetch(request)
      .then(res => {
        // Cache successful GET responses for the shell
        if (res.ok && request.destination !== 'video' && request.destination !== 'audio') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(request).then(cached => cached ?? Response.error()))
  );
});

// ── Push notification ──────────────────────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;

  let payload;
  try   { payload = event.data.json(); }
  catch { payload = { title: 'NEXUS', body: event.data.text(), type: 'message', url: self.location.origin }; }

  const isCall = payload.type === 'call';

  const options = {
    body:               payload.body       || '',
    icon:               payload.icon       || '/icon-192.png',
    badge:              '/icon-192.png',
    tag:                payload.callId     || payload.fromId || 'nexus-msg',
    data: {
      url:      payload.url      || self.location.origin,
      callId:   payload.callId,
      fromId:   payload.fromId,
      type:     payload.type,
    },
    vibrate:            isCall ? [300, 100, 300, 100, 300] : [150],
    requireInteraction: isCall,
    silent:             false,
    timestamp:          Date.now(),
    actions: isCall
      ? [
          { action: 'answer',  title: '✅ Answer'  },
          { action: 'decline', title: '❌ Decline'  },
        ]
      : [
          { action: 'open',    title: '→ Open'      },
        ],
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || 'NEXUS', options)
  );
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  const { action } = event;
  const { url, callId, type } = event.notification.data || {};

  event.notification.close();

  // Decline → do nothing
  if (action === 'decline') return;

  const targetUrl = url || self.location.origin;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Try to focus an existing window
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'notification-click', notifType: type, callId, action });
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// ── Push subscription change (browser rotated keys) ───────────────────────────
self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe({
        userVisibleOnly:      true,
        applicationServerKey: event.oldSubscription?.options?.applicationServerKey,
      })
      .then(sub => {
        // Tell all open clients to re-register with signaling server
        self.clients.matchAll().then(clients =>
          clients.forEach(c => c.postMessage({ type: 'push-resubscribe', subscription: sub.toJSON() }))
        );
      })
      .catch(err => console.warn('[sw] pushsubscriptionchange failed', err))
  );
});
