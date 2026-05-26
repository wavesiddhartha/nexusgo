/**
 * NEXUS Premium Minimalist Synthesized Sound Effects
 * ────────────────────────────────────────────────
 * Generated dynamically using Web Audio API.
 * Zero asset files to download, fully offline, ultra-low latency.
 */

let audioCtx: AudioContext | null = null;

function getContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// 1. Sent Message: A super quick, clean digital click
export function playSentSound() {
  try {
    const ctx = getContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1500, ctx.currentTime + 0.05);

    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  } catch (e) {
    console.warn('[Sounds] failed to play sent sound', e);
  }
}

// 2. Received Message: A warm, rich double-sine pop note
export function playReceivedSound() {
  try {
    const ctx = getContext();
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(330, ctx.currentTime); // E4
    osc1.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.08); // A4

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(660, ctx.currentTime); // E5
    osc2.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08); // A5

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 0.12);
    osc2.stop(ctx.currentTime + 0.12);
  } catch (e) {
    console.warn('[Sounds] failed to play received sound', e);
  }
}

// 3. Connected Peer: A gorgeous ascending ambient chord
export function playConnectedSound() {
  try {
    const ctx = getContext();
    const now = ctx.currentTime;
    
    const playNote = (freq: number, delay: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + delay);
      
      gain.gain.setValueAtTime(0.0, now + delay);
      gain.gain.linearRampToValueAtTime(0.06, now + delay + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + duration);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(now + delay);
      osc.stop(now + delay + duration);
    };

    // A beautiful Major 7th arpeggio: C5, E5, G5, B5
    playNote(523.25, 0.0, 0.4);
    playNote(659.25, 0.08, 0.4);
    playNote(783.99, 0.16, 0.4);
    playNote(987.77, 0.24, 0.5);
  } catch (e) {
    console.warn('[Sounds] failed to play connected sound', e);
  }
}

// 4. Ringing: Repeating soft chime for calls
let ringInterval: any = null;
export function startCallRinging() {
  if (ringInterval) return;
  try {
    const playRing = () => {
      const ctx = getContext();
      const now = ctx.currentTime;
      const notes = [440, 554.37, 659.25]; // A major triad
      
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.1);
        gain.gain.setValueAtTime(0.03, now + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.3);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.1);
        osc.stop(now + i * 0.1 + 0.3);
      });
    };
    
    playRing();
    ringInterval = setInterval(playRing, 1200);
  } catch (e) {
    console.warn('[Sounds] failed to start call ringing', e);
  }
}

export function stopCallRinging() {
  if (ringInterval) {
    clearInterval(ringInterval);
    ringInterval = null;
  }
}
