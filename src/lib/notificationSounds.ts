/**
 * Custom notification sounds synthesized via WebAudio (no asset bundling).
 * - "invite" → ascending royal fanfare (two short bright notes)
 * - "winner" → triumphant arpeggio (three rising notes + shimmer)
 *
 * Designed to be short (<800ms), distinguishable from gift FX, and respectful
 * of users who haven't interacted with the page (calls fail silently).
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const Ctor: typeof AudioContext =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, startOffset: number, duration: number, gain = 0.18, type: OscillatorType = "triangle") {
  const ac = getCtx();
  if (!ac) return;
  const t0 = ac.currentTime + startOffset;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export type NotificationSound = "invite" | "winner";

export function playNotificationSound(kind: NotificationSound) {
  if (typeof window === "undefined") return;
  // Respect document visibility so we never play in background tabs
  if (document.visibilityState === "hidden") return;

  if (kind === "invite") {
    // Two-note royal call: G5 → C6
    tone(784, 0,    0.18, 0.16, "triangle");
    tone(1046, 0.14, 0.26, 0.18, "triangle");
  } else if (kind === "winner") {
    // Triumphant arpeggio C5–E5–G5 + shimmer
    tone(523, 0,    0.16, 0.16, "triangle");
    tone(659, 0.13, 0.16, 0.17, "triangle");
    tone(784, 0.26, 0.30, 0.20, "triangle");
    tone(1568, 0.30, 0.40, 0.08, "sine"); // shimmer harmonic
  }
}
