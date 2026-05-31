/**
 * Royal Gift FX — Web Audio synthesized sound effects + navigator.vibrate haptics.
 * No external assets. Volume + tone scale with gift tier so legendary/mythic
 * feel cinematic compared to low/popular.
 */
import { GiftCategory } from "@/types/gifts";

const STORAGE_KEY = "crownme.fx.muted";

let _ctx: AudioContext | null = null;
function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (_ctx) return _ctx;
  const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Ctor) return null;
  try {
    _ctx = new Ctor();
  } catch {
    _ctx = null;
  }
  return _ctx;
}

export function isMuted(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}
export function setMuted(v: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
}

interface ToneOpts {
  freq: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  release?: number;
  sweepTo?: number;
}

function tone({ freq, duration, type = "sine", gain = 0.18, attack = 0.005, release = 0.08, sweepTo }: ToneOpts, delay = 0) {
  if (isMuted()) return;
  const a = ctx();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t0 + duration);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + attack);
  g.gain.setValueAtTime(gain, t0 + duration - release);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

function noiseBurst(duration: number, gain = 0.12, hp = 600, delay = 0) {
  if (isMuted()) return;
  const a = ctx();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const len = Math.max(1, Math.floor(a.sampleRate * duration));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = hp;
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.connect(filter).connect(g).connect(a.destination);
  src.start(t0);
}

/* ─────────────────────  HAPTICS  ───────────────────── */

function vibrate(pattern: number | number[]) {
  if (isMuted()) return; // mute also silences haptics for consistency
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  try { navigator.vibrate(pattern); } catch { /* iOS-safari noop */ }
}

/* ─────────────────────  PUBLIC FX  ───────────────────── */

/** Subtle tap feedback (used for vote-tier interactions). */
export function fxTap(strong = false) {
  tone({ freq: strong ? 720 : 540, duration: 0.07, type: "triangle", gain: 0.12 });
  vibrate(strong ? 12 : 6);
}

/** Vote success (crown/fire/diamond) — premium chime per type. */
export function fxVote(kind: "crown" | "fire" | "diamond") {
  if (kind === "crown") {
    tone({ freq: 880, duration: 0.18, type: "triangle", gain: 0.16 });
    tone({ freq: 1320, duration: 0.22, type: "sine", gain: 0.10 }, 0.05);
  } else if (kind === "fire") {
    tone({ freq: 320, duration: 0.18, type: "sawtooth", gain: 0.14, sweepTo: 180 });
    noiseBurst(0.16, 0.08, 1400);
  } else {
    tone({ freq: 1760, duration: 0.18, type: "sine", gain: 0.13 });
    tone({ freq: 2640, duration: 0.18, type: "sine", gain: 0.10 }, 0.04);
  }
  vibrate(14);
}

/**
 * Broken Crown / Dislike — short cracked-crown / soft metal-break thud.
 * Throttled to once per 250 ms so rapid taps don't stack into noise.
 * Fails silently when audio is muted, blocked, or unavailable.
 */
let _lastBrokenCrownAt = 0;
export function fxBrokenCrown() {
  const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
  if (now - _lastBrokenCrownAt < 250) return;
  _lastBrokenCrownAt = now;
  try {
    // Low royal "thud" with a downward sweep — feels like a crown hitting marble.
    tone({ freq: 360, duration: 0.18, type: "triangle", gain: 0.14, sweepTo: 110 });
    // Brief metallic high-pass crack layered on top — gold/glass shimmer.
    noiseBurst(0.12, 0.06, 2200, 0.02);
    // Tiny low rumble tail.
    tone({ freq: 90, duration: 0.22, type: "sine", gain: 0.08 }, 0.04);
  } catch { /* never crash a vote because audio failed */ }
  vibrate(18);
}

/** Pre-send "preview" tap on a gift card — light per tier. */
export function fxGiftPreview(tier: GiftCategory) {
  if (tier === "low") tone({ freq: 880, duration: 0.08, type: "triangle", gain: 0.10 });
  else if (tier === "popular") tone({ freq: 1040, duration: 0.10, type: "triangle", gain: 0.12 });
  else if (tier === "premium") {
    tone({ freq: 660, duration: 0.10, type: "sine", gain: 0.12 });
    tone({ freq: 990, duration: 0.10, type: "sine", gain: 0.10 }, 0.04);
  } else if (tier === "legendary") {
    tone({ freq: 523, duration: 0.16, type: "sine", gain: 0.16 });
    tone({ freq: 784, duration: 0.16, type: "sine", gain: 0.12 }, 0.04);
    tone({ freq: 1047, duration: 0.18, type: "sine", gain: 0.10 }, 0.08);
  } else {
    tone({ freq: 392, duration: 0.22, type: "sine", gain: 0.18 });
    tone({ freq: 587, duration: 0.22, type: "sine", gain: 0.14 }, 0.05);
    tone({ freq: 880, duration: 0.24, type: "sine", gain: 0.12 }, 0.10);
    tone({ freq: 1175, duration: 0.26, type: "sine", gain: 0.10 }, 0.15);
  }
  vibrate(tier === "low" ? 6 : tier === "popular" ? 10 : tier === "premium" ? 14 : tier === "legendary" ? 22 : 30);
}

/** Full send celebration — louder + longer for higher tiers. */
export function fxGiftSend(tier: GiftCategory) {
  if (tier === "low") {
    tone({ freq: 660, duration: 0.12, type: "triangle", gain: 0.16 });
    tone({ freq: 990, duration: 0.14, type: "sine", gain: 0.12 }, 0.05);
    vibrate([10, 20, 10]);
  } else if (tier === "popular") {
    tone({ freq: 523, duration: 0.14, type: "triangle", gain: 0.18 });
    tone({ freq: 784, duration: 0.16, type: "sine", gain: 0.14 }, 0.06);
    tone({ freq: 1047, duration: 0.18, type: "sine", gain: 0.10 }, 0.12);
    vibrate([12, 24, 12]);
  } else if (tier === "premium") {
    tone({ freq: 392, duration: 0.18, type: "sine", gain: 0.20 });
    tone({ freq: 587, duration: 0.18, type: "sine", gain: 0.16 }, 0.06);
    tone({ freq: 784, duration: 0.20, type: "sine", gain: 0.14 }, 0.12);
    noiseBurst(0.20, 0.06, 2000, 0.05);
    vibrate([14, 30, 14, 30, 14]);
  } else if (tier === "legendary") {
    // Fanfare
    tone({ freq: 392, duration: 0.22, type: "sawtooth", gain: 0.18 });
    tone({ freq: 523, duration: 0.22, type: "sawtooth", gain: 0.18 }, 0.10);
    tone({ freq: 659, duration: 0.26, type: "sawtooth", gain: 0.18 }, 0.20);
    tone({ freq: 784, duration: 0.34, type: "sawtooth", gain: 0.20 }, 0.30);
    tone({ freq: 1047, duration: 0.40, type: "sine", gain: 0.18 }, 0.40);
    noiseBurst(0.40, 0.10, 3000, 0.30);
    vibrate([20, 40, 20, 60, 30, 80, 50]);
  } else {
    // Mythic — cinematic
    tone({ freq: 261, duration: 0.30, type: "sine", gain: 0.22 });
    tone({ freq: 329, duration: 0.30, type: "sine", gain: 0.22 }, 0.10);
    tone({ freq: 392, duration: 0.32, type: "sine", gain: 0.22 }, 0.20);
    tone({ freq: 523, duration: 0.36, type: "sawtooth", gain: 0.20 }, 0.30);
    tone({ freq: 784, duration: 0.42, type: "sawtooth", gain: 0.22 }, 0.45);
    tone({ freq: 1047, duration: 0.50, type: "sine", gain: 0.22 }, 0.60);
    tone({ freq: 1568, duration: 0.55, type: "sine", gain: 0.18 }, 0.75);
    noiseBurst(0.55, 0.14, 1200, 0.30);
    noiseBurst(0.40, 0.12, 4000, 0.55);
    vibrate([30, 60, 30, 80, 40, 120, 60, 160, 80]);
  }
}

/** Purchase / unlock success chime. */
export function fxPurchase() {
  tone({ freq: 523, duration: 0.10, type: "triangle", gain: 0.18 });
  tone({ freq: 784, duration: 0.14, type: "sine", gain: 0.16 }, 0.06);
  tone({ freq: 1047, duration: 0.18, type: "sine", gain: 0.14 }, 0.14);
  vibrate([12, 30, 12]);
}

/** Resume audio context on first user gesture (autoplay policy). */
export function unlockAudio() {
  const a = ctx();
  if (a && a.state === "suspended") a.resume().catch(() => {});
}
