'use client';

import { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { formatDuration } from '@nexus/shared';
import { cn } from '@/lib/utils';

interface Props {
  url?:       string;
  durationMs: number;
  progress:   number;
  done:       boolean;
  mine:       boolean;
}

export function VoiceBubble({ url, durationMs, progress, done, mine }: Props) {
  const [playing,  setPlaying]  = useState(false);
  const [current,  setCurrent]  = useState(0); // 0-100 percentage
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const toggle = useCallback(() => {
    if (!audioRef.current || !url) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setPlaying(true);
    }
  }, [url, playing]);

  const trackBg  = mine ? 'rgba(255,255,255,0.18)' : '#deded8';
  const fillBg   = mine ? '#ffffff'                 : '#080808';
  const textCol  = mine ? 'rgba(255,255,255,0.48)'  : '#a0a09a';

  return (
    <div className={cn(
      'flex items-center gap-3 px-3.5 py-3 rounded-[18px]',
      'min-w-[190px] max-w-[240px]',
      mine ? 'bg-[#080808] rounded-br-[5px]' : 'bg-[#f0f0ee] rounded-bl-[5px]'
    )}>
      {/* Hidden audio */}
      {url && (
        <audio
          ref={audioRef}
          src={url}
          onEnded={() => { setPlaying(false); setCurrent(0); }}
          onTimeUpdate={e => {
            const el  = e.currentTarget;
            const dur = el.duration;
            if (dur > 0) setCurrent((el.currentTime / dur) * 100);
          }}
        />
      )}

      {/* Play/pause/loading button */}
      <button
        onClick={toggle}
        disabled={!done}
        className={cn(
          'w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-opacity',
          !done && 'opacity-40',
          mine ? 'bg-white/15' : 'bg-[#e0e0dc]'
        )}
      >
        {!done ? (
          /* Loading spinner */
          <div
            className="w-4 h-4 rounded-full border-[1.5px] border-t-transparent animate-spin"
            style={{ borderColor: mine ? 'rgba(255,255,255,0.5)' : '#a0a09a', borderTopColor: 'transparent' }}
          />
        ) : playing ? (
          /* Pause icon */
          <svg className="w-4 h-4" fill={mine ? '#fff' : '#080808'} viewBox="0 0 24 24">
            <rect x="6"  y="4" width="4" height="16" rx="1"/>
            <rect x="14" y="4" width="4" height="16" rx="1"/>
          </svg>
        ) : (
          /* Play icon */
          <svg className="w-4 h-4 ml-0.5" fill={mine ? '#fff' : '#080808'} viewBox="0 0 24 24">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
        )}
      </button>

      {/* Waveform / progress track */}
      <div className="flex-1 flex flex-col gap-1.5 min-w-0">
        {/* Track bar */}
        <div className="relative h-[3px] rounded-full overflow-hidden" style={{ background: trackBg }}>
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ background: fillBg }}
            animate={{ width: `${done ? (playing ? current : (current > 0 ? current : 0)) : progress}%` }}
            transition={{ duration: 0.12 }}
          />
        </div>
        {/* Duration */}
        <span className="text-[10px] font-mono font-light" style={{ color: textCol }}>
          {playing && audioRef.current
            ? formatDuration((current / 100) * durationMs)
            : formatDuration(durationMs)}
        </span>
      </div>

      {/* Mic icon decoration */}
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"
           style={{ stroke: mine ? 'rgba(255,255,255,0.25)' : '#c8c8c2' }}>
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
      </svg>
    </div>
  );
}
