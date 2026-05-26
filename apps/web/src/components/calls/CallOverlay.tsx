'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNexusStore } from '@/store/nexus.store';
import { formatDuration } from '@nexus/shared';
import { cn } from '@/lib/utils';

export function CallOverlay() {
  const call        = useNexusStore(s => s.activeCall);
  const answerCall  = useNexusStore(s => s.answerCall);
  const endCall     = useNexusStore(s => s.endCall);
  const toggleMute  = useNexusStore(s => s.toggleMute);
  const toggleVideo = useNexusStore(s => s.toggleVideo);

  const [elapsed, setElapsed] = useState(0);
  const [speaker, setSpeaker] = useState(false);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const localVidRef = useRef<HTMLVideoElement>(null);
  const remoteVidRef= useRef<HTMLVideoElement>(null);
  const remoteAudRef= useRef<HTMLAudioElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ringTimerRef= useRef<ReturnType<typeof setInterval> | null>(null);

  // Attach streams
  useEffect(() => {
    if (call?.localStream  && localVidRef.current)  localVidRef.current.srcObject  = call.localStream;
    if (call?.remoteStream && remoteVidRef.current)  remoteVidRef.current.srcObject = call.remoteStream;
    if (call?.remoteStream && remoteAudRef.current)  remoteAudRef.current.srcObject = call.remoteStream;
  }, [call?.localStream, call?.remoteStream]);

  // Call timer
  useEffect(() => {
    if (call?.state === 'active' && call.startedAt) {
      const base = call.startedAt;
      setElapsed(Date.now() - base);
      timerRef.current = setInterval(() => setElapsed(Date.now() - base), 1000);
    } else {
      setElapsed(0);
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [call?.state, call?.startedAt]);

  // Ringtone using Web Audio API
  useEffect(() => {
    const ringing = call?.state === 'ringing-in' || call?.state === 'ringing-out';
    if (!ringing) {
      if (ringTimerRef.current) { clearInterval(ringTimerRef.current); ringTimerRef.current = null; }
      if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null; }
      return;
    }

    const playBeep = () => {
      try {
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
          audioCtxRef.current = new AudioContext();
        }
        const ctx  = audioCtxRef.current;
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.setValueAtTime(500, ctx.currentTime + 0.35);
        gain.gain.setValueAtTime(0.28, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.85);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.85);
      } catch {}
    };

    playBeep();
    ringTimerRef.current = setInterval(playBeep, 1800);

    return () => {
      if (ringTimerRef.current) { clearInterval(ringTimerRef.current); ringTimerRef.current = null; }
      if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null; }
    };
  }, [call?.state]);

  const handleAnswer  = useCallback(() => call && answerCall(call.callId, true), [call, answerCall]);
  const handleDecline = useCallback(() => call && (call.state === 'ringing-in' ? answerCall(call.callId, false) : endCall('ended')), [call, answerCall, endCall]);

  if (!call) return null;

  const isVideo   = call.kind === 'video';
  const isActive  = call.state === 'active';
  const isRingIn  = call.state === 'ringing-in';
  const isRingOut = call.state === 'ringing-out';
  const ini       = call.peerName.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[200] flex flex-col"
        style={{ background: isVideo && isActive ? '#000' : 'linear-gradient(160deg,#111 0%,#0a0a0a 100%)' }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        {/* Remote video */}
        {isVideo && isActive && (
          <video ref={remoteVidRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
        )}

        {/* Audio element (voice calls / voice in video call) */}
        <audio ref={remoteAudRef} autoPlay />

        {/* Top section — peer info */}
        <div className="relative z-10 flex flex-col items-center pt-[20%] flex-1">
          {/* Animated avatar */}
          <motion.div
            className="w-[88px] h-[88px] rounded-full border border-white/20 flex items-center justify-center text-[28px] font-medium text-white mb-5"
            style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(12px)' }}
            animate={isRingIn || isRingOut ? { scale: [1, 1.05, 1] } : {}}
            transition={{ repeat: Infinity, duration: 1.6 }}
          >
            {ini}
          </motion.div>

          <h2 className="text-[22px] font-medium text-white mb-1.5">{call.peerName}</h2>

          <p className="text-[13px] font-mono font-light" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {isRingOut && 'Calling…'}
            {isRingIn  && `Incoming ${call.kind} call`}
            {isActive  && formatDuration(elapsed)}
          </p>

          {/* Call kind badge */}
          <div className="flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
            {isVideo
              ? <svg className="w-3.5 h-3.5 text-white/60" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
              : <svg className="w-3.5 h-3.5 text-white/60" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            }
            <span className="text-[11px] font-mono font-light text-white/50">{isVideo ? 'video call' : 'voice call'}</span>
          </div>

          {/* Sound wave animation while ringing */}
          {(isRingIn || isRingOut) && (
            <div className="flex items-center gap-1 mt-6">
              {[0, 0.1, 0.2, 0.3, 0.4, 0.3, 0.2, 0.1].map((d, i) => (
                <motion.div key={i} className="w-[3px] rounded-full" style={{ background: 'rgba(255,255,255,0.25)' }}
                  animate={{ height: ['6px', '22px', '6px'] }} transition={{ repeat: Infinity, duration: 0.9, delay: d }} />
              ))}
            </div>
          )}

          {/* Local video PiP */}
          {isVideo && isActive && (
            <div className="absolute top-4 right-4 w-28 h-40 rounded-[14px] overflow-hidden border border-white/20 shadow-2xl">
              <video ref={localVidRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="relative z-10 pb-16 px-6">
          {isRingIn ? (
            /* Incoming — big answer + decline */
            <div className="flex items-center justify-around max-w-[280px] mx-auto">
              <CallBtn size="lg" bg="#ef4444"   icon={<PhoneOffIcon />} label="Decline" onPress={handleDecline} />
              <CallBtn size="lg" bg="#22c55e"   icon={<PhoneIcon />}    label="Answer"  onPress={handleAnswer} />
            </div>
          ) : (
            /* Active / outgoing — control row */
            <div className="flex items-center justify-center gap-5 flex-wrap">
              <CallBtn size="sm" bg={call.muted    ? '#fff' : 'rgba(255,255,255,0.12)'} iconColor={call.muted    ? '#000' : '#fff'} icon={call.muted    ? <MicOffIcon />   : <MicOnIcon />}    label={call.muted    ? 'Unmute' : 'Mute'}   onPress={() => toggleMute()} />
              {isVideo && (
              <CallBtn size="sm" bg={call.videoOff ? '#fff' : 'rgba(255,255,255,0.12)'} iconColor={call.videoOff ? '#000' : '#fff'} icon={call.videoOff ? <VideoOffIcon /> : <VideoOnIcon />}   label={call.videoOff ? 'Show'   : 'Camera'} onPress={() => toggleVideo()} />
              )}
              <CallBtn size="sm" bg={speaker       ? '#fff' : 'rgba(255,255,255,0.12)'} iconColor={speaker       ? '#000' : '#fff'} icon={<SpeakerIcon />}   label="Speaker" onPress={() => setSpeaker(v => !v)} />
              <CallBtn size="md" bg="#ef4444" icon={<PhoneOffIcon />} label="End" onPress={() => endCall('ended')} />
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Call button ────────────────────────────────────────────────────────────────
function CallBtn({ size = 'sm', bg, iconColor = '#fff', icon, label, onPress }: {
  size?: 'sm' | 'md' | 'lg';
  bg: string; iconColor?: string;
  icon: React.ReactNode; label: string; onPress: () => void;
}) {
  const sz = size === 'lg' ? 'w-16 h-16' : size === 'md' ? 'w-14 h-14' : 'w-12 h-12';
  return (
    <button onClick={onPress} className="flex flex-col items-center gap-1.5">
      <div className={cn('rounded-full flex items-center justify-center active:scale-90 transition-transform', sz)} style={{ background: bg }}>
        <div style={{ color: iconColor }}>{icon}</div>
      </div>
      <span className="text-[10px] font-mono font-light" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</span>
    </button>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const I = (d: React.ReactNode) => <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">{d}</svg>;
const PhoneIcon    = () => I(<><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></>);
const PhoneOffIcon = () => I(<><path d="m16.5 6.5-2.3 2.3a3 3 0 0 0 0 4.24l1.42 1.42a3 3 0 0 1 0 4.24l-1.42 1.42a3 3 0 0 1-4.24 0L8.5 18.5a3 3 0 0 0-4.24 0L2 20.76"/><line x1="22" y1="2" x2="2" y2="22"/></>);
const MicOnIcon    = () => I(<><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></>);
const MicOffIcon   = () => I(<><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></>);
const VideoOnIcon  = () => I(<><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></>);
const VideoOffIcon = () => I(<><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><line x1="1" y1="1" x2="23" y2="23"/></>);
const SpeakerIcon  = () => I(<><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></>);
