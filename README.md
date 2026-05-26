# NEXUS — nexusgo.me

**Instant peer-to-peer communication. Same Wi-Fi or anywhere. No accounts. No cloud.**

---

## What it does

Everyone on the same Wi-Fi (or with your invite link) can:
- **Chat** — real-time messages, delivered P2P, E2E encrypted
- **Voice & video call** — directly device-to-device via WebRTC
- **Send voice messages** — hold to record, release to send
- **Transfer files** — up to 2 GB, direct P2P at full Wi-Fi speed, live MB/s + ETA
- **Group rooms** — create a room, share the ID, everyone joins and chats
- **Get notifications** — push alerts even when the tab is closed

Identity is an auto-assigned anime character name (editable). No signup. No phone number.

---

## Architecture

```
nexus/ (pnpm monorepo + Turborepo)
├── apps/
│   ├── web/          Next.js 15 PWA  →  nexusgo.me
│   └── signaling/    uWebSockets.js  →  signal.nexusgo.me
└── packages/
    └── shared/       TypeScript types & constants (used by both)
```

**Data flow:**
```
Browser A ──[WS: SDP+ICE]──► Signaling Server ──[WS: SDP+ICE]──► Browser B
Browser A ◄──────── WebRTC DataChannel (P2P, DTLS encrypted) ────────► Browser B
               chat · files · voice messages · group messages
```

**Calls:**
```
A dials B ──► signaling sends Web Push ──► B notified (even tab closed)
B taps notification ──► getUserMedia on both sides ──► addTrack to PeerConnection
                 ↓
    ICE negotiation → DTLS → SRTP (encrypted audio/video P2P)
```

**Groups:**
```
A creates room ──► signaling assigns short ID (e.g. "a2f9b7c1")
B, C, D join by ID ──► signaling tells A about B, C, D
A connects to B, C, D via WebRTC ──► mesh broadcast
```

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 15 + React 19 | App Router, PWA, SSR |
| State | Zustand + Immer | Simple, fast, no boilerplate |
| Animations | Framer Motion | Production-quality motion |
| Signaling | uWebSockets.js | ~6× faster than `ws`; handles 100k+ connections |
| P2P | Browser WebRTC (native) | No PeerJS wrapper; direct control |
| Negotiation | RFC 8829 Perfect Negotiation | Collision-free offer/answer |
| Push | Web Push API + VAPID | OS-level notifications, works when tab is closed |
| Styling | Tailwind + DM Sans/Mono | Clean, minimal, consistent |
| Fonts | DM Sans + DM Mono | Matches the NEXUS design language |

---

## Getting started

### Prerequisites
- Node.js ≥ 20
- pnpm ≥ 9  →  `npm i -g pnpm@9`

```bash
git clone https://github.com/your-org/nexus
cd nexus
pnpm install
```

### Run locally (two terminals)

```bash
# Terminal 1 — signaling server on :8787
pnpm --filter @nexus/signaling dev

# Terminal 2 — web app on :3000
pnpm --filter @nexus/web dev
```

Open **http://localhost:3000** in two browser tabs or two devices on the same machine.  
They will discover each other automatically. Tap a peer to chat.

To test across devices on the same Wi-Fi:  
Change `NEXT_PUBLIC_SIGNALING_URL` in `.env.local` to `ws://<your-machine-ip>:8787`.

---

## Production deployment

### Step 1 — Generate VAPID keys (one-time setup)

```bash
cd apps/signaling
npx web-push generate-vapid-keys
# Copy the two keys into your environment
```

### Step 2 — Deploy signaling server → Fly.io

```bash
cd apps/signaling
fly launch        # uses fly.toml; follow prompts
fly secrets set \
  VAPID_PUBLIC_KEY="<your-public-key>"  \
  VAPID_PRIVATE_KEY="<your-private-key>" \
  VAPID_CONTACT="mailto:mail@nexusgo.me"
fly deploy
```

Alternative hosts: **Railway**, **Render**, **DigitalOcean App Platform**.

### Step 3 — Deploy web app → Vercel

```bash
# In Vercel dashboard or vercel.json, set:
# NEXT_PUBLIC_SIGNALING_URL = wss://signal.nexusgo.me

vercel deploy --prod
```

Alternative: **Netlify**, **Cloudflare Pages**.

### Step 4 — DNS (nexusgo.me)

| Record | Type | Target |
|---|---|---|
| `nexusgo.me`        | A / CNAME | → Vercel edge          |
| `signal.nexusgo.me` | CNAME     | → your-app.fly.dev     |
| MX records          | MX        | → your mail provider   |

---

## Push notifications — platform support

| Platform | Status | Notes |
|---|---|---|
| Android Chrome | ✅ Full | Background + call screen |
| Desktop Chrome / Edge / Firefox | ✅ Full | Works out of the box |
| iPhone (iOS 16.4+) — PWA installed | ✅ Works | User must "Add to Home Screen" first |
| iPhone (iOS < 16.4) | ❌ No web push | Need React Native for this |
| iPhone Safari (not installed as PWA) | ❌ No web push | — |

---

## Scaling

**Single node handles ~25k concurrent connections** (256 MB, 1 CPU on Fly.io).

To scale horizontally:
1. Add Redis adapter — swap `Map` stores for `Redis.HSET + PUB/SUB`
2. Run N instances behind Fly.io's global anycast load balancer
3. Each node handles its own WebSocket connections; cross-node signaling routes via Redis

For group calls beyond 8 people, replace the mesh topology with an SFU:
- **LiveKit** (open source, self-hostable)
- **Cloudflare Calls** (pay-as-you-go)

For restrictive NAT / corporate firewalls, add TURN servers:
- **Metered.ca** (free tier available)
- **Self-hosted coturn**

---

## File structure

```
apps/web/src/
├── app/
│   ├── layout.tsx          Root layout (fonts, metadata, Toaster)
│   ├── page.tsx            Entry point (SW registration, auto-connect)
│   └── globals.css         Global styles (Tailwind, animations, resets)
├── components/
│   ├── layout/
│   │   └── AppShell.tsx    Top bar + 5 screens + bottom nav + CallOverlay
│   ├── discover/
│   │   └── DiscoverScreen.tsx   Node canvas, peer popup, quick-send bar
│   ├── peers/
│   │   └── PeersScreen.tsx      Peer list with voice/video call shortcuts
│   ├── chat/
│   │   └── ChatScreen.tsx       1:1 chat, file transfer, voice messages, calls
│   ├── groups/
│   │   └── GroupsScreen.tsx     Group rooms, group chat
│   ├── calls/
│   │   └── CallOverlay.tsx      Full-screen voice/video call UI
│   ├── profile/
│   │   └── ProfileScreen.tsx    QR code, push notifications, stats, settings
│   └── ui/
│       ├── VoiceRecorder.tsx    Hold-to-record with live waveform
│       └── VoiceBubble.tsx      Voice message playback bubble
├── hooks/index.ts          Typing indicator, autoscroll, QR code, etc.
├── lib/
│   ├── webrtc-manager.ts   Core P2P engine (836 lines)
│   └── utils.ts            cn() helper
└── store/
    └── nexus.store.ts      Zustand global store (340 lines)

apps/signaling/src/
└── server.ts               uWebSockets.js signaling + push + rooms (280 lines)

packages/shared/src/
└── index.ts                Types, constants, utilities (shared)

apps/web/public/
├── sw.js                   Service Worker (push + offline cache)
└── manifest.json           PWA manifest
```

---

## Roadmap

- [x] WebRTC P2P messaging (text)
- [x] Voice & video calls
- [x] Voice messages (hold-to-record)
- [x] File transfer (256 KB chunks, backpressure, MB/s + ETA, up to 2 GB)
- [x] Group rooms (mesh broadcast)
- [x] Web Push notifications (VAPID)
- [x] PWA + Service Worker (installable, offline shell)
- [x] Anime character name identity
- [ ] TURN server integration (Metered.ca)
- [ ] Redis adapter for multi-node signaling
- [ ] React Native app (iOS VoIP push, true background calls)
- [ ] SFU group calls (LiveKit / Cloudflare Calls — 10+ people)
- [ ] Screen sharing
- [ ] Encrypted drop boxes (offline file delivery, auto-expire)
- [ ] Message reactions
- [ ] Read receipts

---

## License

MIT — [nexusgo.me](https://nexusgo.me) · [mail@nexusgo.me](mailto:mail@nexusgo.me)
