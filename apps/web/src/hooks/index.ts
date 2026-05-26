'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useNexusStore } from '@/store/nexus.store';

// ── Typing indicator ──────────────────────────────────────────────────────────
export function useTypingIndicator(peerId: string | null): boolean {
  const [isTyping, setIsTyping] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manager  = useNexusStore(s => s.manager);

  useEffect(() => {
    if (!manager || !peerId) return;
    const unsub = manager.on(ev => {
      if (ev.type === 'typing' && ev.peerId === peerId) {
        setIsTyping(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setIsTyping(false), 3000);
      }
    });
    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [manager, peerId]);

  return isTyping;
}

// ── Debounced typing sender ───────────────────────────────────────────────────
export function useTypingSender(peerId: string | null): () => void {
  const sendTyping = useNexusStore(s => s.sendTyping);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  return useCallback(() => {
    if (!peerId) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { if (peerId) sendTyping(peerId); }, 250);
  }, [peerId, sendTyping]);
}

// ── Canvas resize observer ────────────────────────────────────────────────────
export function useCanvasDimensions(ref: React.RefObject<HTMLElement | null>): { w: number; h: number } {
  const [dims, setDims] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!ref.current) return;
    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setDims({ w: Math.round(width), h: Math.round(height) });
    });
    obs.observe(ref.current);
    // Trigger immediately
    const rect = ref.current.getBoundingClientRect();
    if (rect.width > 0) setDims({ w: Math.round(rect.width), h: Math.round(rect.height) });
    return () => obs.disconnect();
  }, [ref]);

  return dims;
}

// ── QR code canvas ────────────────────────────────────────────────────────────
export function useQRCode(
  value: string,
  canvasRef: React.RefObject<HTMLCanvasElement | null>
): void {
  useEffect(() => {
    if (!value || !canvasRef.current) return;
    import('qrcode').then(QRCode => {
      if (!canvasRef.current) return;
      QRCode.toCanvas(canvasRef.current, value, {
        width:  160,
        margin: 2,
        color:  { dark: '#080808', light: '#ffffff' },
      }).catch(console.warn);
    });
  }, [value, canvasRef]);
}

// ── Auto-scroll to bottom ─────────────────────────────────────────────────────
export function useAutoscroll(deps: unknown[]): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Only auto-scroll if user is near the bottom (within 120px)
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}

// ── Textarea auto-resize ──────────────────────────────────────────────────────
export function useAutoResize(
  ref: React.RefObject<HTMLTextAreaElement | null>
): () => void {
  return useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [ref]);
}

// ── Media permissions check ───────────────────────────────────────────────────
export function useMediaPermissions(): {
  micGranted:    boolean | null;
  cameraGranted: boolean | null;
} {
  const [mic,  setMic]  = useState<boolean | null>(null);
  const [cam,  setCam]  = useState<boolean | null>(null);

  useEffect(() => {
    if (!navigator.permissions) return;
    navigator.permissions.query({ name: 'microphone' as PermissionName })
      .then(r => setMic(r.state === 'granted'))
      .catch(() => setMic(null));
    navigator.permissions.query({ name: 'camera' as PermissionName })
      .then(r => setCam(r.state === 'granted'))
      .catch(() => setCam(null));
  }, []);

  return { micGranted: mic, cameraGranted: cam };
}

// ── Document visibility ───────────────────────────────────────────────────────
export function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(
    typeof document !== 'undefined' ? document.visibilityState === 'visible' : true
  );

  useEffect(() => {
    const handler = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  return visible;
}
