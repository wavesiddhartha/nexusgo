'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDuration } from '@nexus/shared';

interface Props {
  onSend:   (blob: Blob, durationMs: number) => void;
  onCancel: () => void;
}

type RecState = 'recording' | 'preview';

export function VoiceRecorder({ onSend, onCancel }: Props) {
  const [state,     setState]     = useState<RecState>('recording');
  const [elapsed,   setElapsed]   = useState(0);
  const [amps,      setAmps]      = useState<number[]>(new Array(28).fill(0.08));
  const [audioURL,  setAudioURL]  = useState<string | null>(null);

  const recRef      = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<Blob[]>([]);
  const blobRef     = useRef<Blob | null>(null);
  const durationRef = useRef(0);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef      = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const ctxRef      = useRef<AudioContext | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);

  // Start recording immediately on mount
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;

        // Web Audio analyser for waveform
        const ctx = new AudioContext();
        ctxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const an  = ctx.createAnalyser();
        an.fftSize = 64;
        src.connect(an);
        analyserRef.current = an;

        // MediaRecorder
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
            ? 'audio/ogg;codecs=opus'
            : 'audio/webm';

        const rec = new MediaRecorder(stream, { mimeType });
        recRef.current    = rec;
        chunksRef.current = [];
        rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        rec.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: mimeType });
          blobRef.current  = blob;
          setAudioURL(URL.createObjectURL(blob));
          setState('preview');
          stream.getTracks().forEach(t => t.stop());
        };
        rec.start(100);

        // Timer
        let ms = 0;
        timerRef.current = setInterval(() => { ms += 100; durationRef.current = ms; setElapsed(ms); }, 100);

        // Waveform animation
        const draw = () => {
          rafRef.current = requestAnimationFrame(draw);
          const data = new Uint8Array(an.frequencyBinCount);
          an.getByteFrequencyData(data);
          setAmps(Array.from(data).slice(0, 28).map(v => Math.max(0.06, v / 255)));
        };
        draw();
      } catch (err) {
        console.warn('[voice] mic error', err);
        if (!cancelled) onCancel();
      }
    })();

    return () => {
      cancelled = true;
      if (timerRef.current)  clearInterval(timerRef.current);
      if (rafRef.current)    cancelAnimationFrame(rafRef.current);
      ctxRef.current?.close().catch(() => {});
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopAndPreview = useCallback(() => {
    if (timerRef.current)  { clearInterval(timerRef.current);   timerRef.current  = null; }
    if (rafRef.current)    { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    ctxRef.current?.close().catch(() => {});
    recRef.current?.stop();
  }, []);

  const handleSend = useCallback(() => {
    if (blobRef.current) onSend(blobRef.current, durationRef.current);
  }, [onSend]);

  const handleCancel = useCallback(() => {
    stopAndPreview();
    onCancel();
  }, [stopAndPreview, onCancel]);

  return (
    <motion.div
      className="flex items-center gap-2.5 w-full bg-[#f5f5f3] rounded-[22px] px-3.5 py-2.5"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.15 }}
    >
      {/* Cancel */}
      <button
        onClick={handleCancel}
        className="w-7 h-7 rounded-full bg-[#fee2e2] flex items-center justify-center shrink-0 active:scale-90 transition-transform"
      >
        <svg className="w-3.5 h-3.5 stroke-[#ef4444]" fill="none" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>

      {state === 'recording' ? (
        <>
          {/* Live waveform */}
          <div className="flex-1 flex items-center justify-center gap-[2px] h-8 overflow-hidden">
            {amps.map((a, i) => (
              <motion.div
                key={i}
                className="w-[3px] rounded-full bg-[#ef4444] shrink-0"
                animate={{ height: `${Math.round(a * 26 + 4)}px` }}
                transition={{ duration: 0.06 }}
              />
            ))}
          </div>

          {/* Timer */}
          <span className="text-[11px] font-mono font-light text-[#ef4444] tabular-nums shrink-0">
            {formatDuration(elapsed)}
          </span>

          {/* Stop */}
          <button
            onClick={stopAndPreview}
            className="w-7 h-7 rounded-full bg-[#ef4444] flex items-center justify-center shrink-0 active:scale-90 transition-transform"
          >
            <div className="w-3 h-3 bg-white rounded-[3px]" />
          </button>
        </>
      ) : (
        <>
          {/* Preview player */}
          {audioURL && (
            <audio src={audioURL} controls className="flex-1 h-8" style={{ minWidth: 0 }} />
          )}
          <span className="text-[10px] font-mono font-light text-[#a0a09a] shrink-0">
            {formatDuration(durationRef.current)}
          </span>
          {/* Send */}
          <button
            onClick={handleSend}
            className="w-7 h-7 rounded-full bg-[#080808] flex items-center justify-center shrink-0 active:scale-90 transition-transform"
          >
            <svg className="w-[12px] h-[12px]" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </>
      )}
    </motion.div>
  );
}
