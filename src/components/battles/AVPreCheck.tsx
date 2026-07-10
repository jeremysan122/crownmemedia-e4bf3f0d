// Wave 2 — Lobby AV pre-check.
// Local-only browser check: camera preview, mic level meter, and a rough
// network signal. No LiveKit connection required so the user can debug
// their hardware before entering the lobby room.

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff, Wifi, WifiOff } from "lucide-react";

type Signal = "unknown" | "good" | "ok" | "poor";

export default function AVPreCheck() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [signal, setSignal] = useState<Signal>("unknown");

  useEffect(() => {
    let cancelled = false;
    let audioCtx: AudioContext | null = null;
    let raf = 0;

    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
        // Mic level meter
        const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext);
        audioCtx = new AudioCtx();
        const src = audioCtx.createMediaStreamSource(s);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        const buf = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteFrequencyData(buf);
          const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
          setMicLevel(Math.min(1, avg / 128));
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch (e) {
        setError("Couldn't access your camera or mic. Check browser permissions.");
      }
    })();

    // Rough network signal via connection API + a tiny ping.
    const conn = (navigator as any).connection;
    if (conn?.effectiveType) {
      const t = conn.effectiveType as string;
      setSignal(t === "4g" ? "good" : t === "3g" ? "ok" : "poor");
    } else {
      // Fallback: measure a tiny fetch.
      const start = performance.now();
      fetch("/robots.txt", { cache: "no-store" })
        .then(() => {
          const ms = performance.now() - start;
          setSignal(ms < 200 ? "good" : ms < 600 ? "ok" : "poor");
        })
        .catch(() => setSignal("poor"));
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      audioCtx?.close().catch(() => {});
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const SignalIcon = signal === "poor" ? WifiOff : Wifi;
  const signalColor =
    signal === "good" ? "text-emerald-500"
    : signal === "ok" ? "text-amber-500"
    : signal === "poor" ? "text-red-500"
    : "text-muted-foreground";
  const signalLabel =
    signal === "good" ? "Strong connection"
    : signal === "ok" ? "Okay connection"
    : signal === "poor" ? "Weak connection — try Wi-Fi"
    : "Checking connection…";

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <div className="aspect-video w-full overflow-hidden rounded-xl bg-black relative">
        {stream ? (
          <video
            ref={videoRef}
            className="size-full object-cover"
            muted
            playsInline
            aria-label="Camera preview"
          />
        ) : (
          <div className="size-full flex items-center justify-center text-muted-foreground">
            {error ? <VideoOff aria-hidden /> : <Video aria-hidden className="animate-pulse" />}
          </div>
        )}
        {error && (
          <div role="alert" className="absolute inset-x-0 bottom-0 bg-red-500/90 text-white text-xs p-2 text-center">
            {error}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          {micLevel > 0.02 ? <Mic className="text-emerald-500" size={18} aria-hidden />
                          : <MicOff className="text-muted-foreground" size={18} aria-hidden />}
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden" role="meter"
               aria-label="Microphone input level" aria-valuenow={Math.round(micLevel * 100)}
               aria-valuemin={0} aria-valuemax={100}>
            <div
              className="h-full bg-emerald-500 transition-[width] duration-75"
              style={{ width: `${Math.min(100, micLevel * 140)}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <SignalIcon size={18} className={signalColor} aria-hidden />
          <span className={signalColor}>{signalLabel}</span>
        </div>
      </div>
    </div>
  );
}
