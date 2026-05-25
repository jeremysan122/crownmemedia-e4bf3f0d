import logo from "@/assets/crownme-logo.png";

interface Props {
  /** Optional message under the logo. */
  label?: string;
  /** Full-screen overlay vs inline. Defaults to fullscreen. */
  fullscreen?: boolean;
}

/**
 * CrownMe loading screen — a "rain of crowns" animation. Multiple
 * logos drift down a royal gradient backdrop while the central hero
 * logo gently pulses. Replaces the legacy rainbow conic ring.
 */
export default function CrownLoader({ label = "Loading the throne…", fullscreen = true }: Props) {
  const wrap = fullscreen
    ? "fixed inset-0 z-[100] bg-gradient-royal flex flex-col items-center justify-center overflow-hidden"
    : "relative w-full py-20 flex flex-col items-center justify-center overflow-hidden";

  // Pre-computed columns — irregular timing & sizes so the rain never tiles
  const drops = [
    { left: "6%",  size: 22, delay: 0,    dur: 4.2, opacity: 0.55 },
    { left: "14%", size: 14, delay: 1.1,  dur: 3.4, opacity: 0.35 },
    { left: "22%", size: 28, delay: 0.6,  dur: 5.0, opacity: 0.65 },
    { left: "31%", size: 18, delay: 2.2,  dur: 3.8, opacity: 0.45 },
    { left: "40%", size: 24, delay: 0.3,  dur: 4.6, opacity: 0.55 },
    { left: "50%", size: 16, delay: 1.6,  dur: 3.2, opacity: 0.4 },
    { left: "60%", size: 26, delay: 0.9,  dur: 4.8, opacity: 0.6 },
    { left: "69%", size: 18, delay: 2.5,  dur: 3.6, opacity: 0.45 },
    { left: "78%", size: 22, delay: 0.4,  dur: 4.4, opacity: 0.55 },
    { left: "86%", size: 14, delay: 1.9,  dur: 3.0, opacity: 0.35 },
    { left: "94%", size: 24, delay: 0.7,  dur: 5.2, opacity: 0.6 },
  ];

  return (
    <div className={wrap} role="status" aria-live="polite">
      {/* Falling crowns layer */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {drops.map((d, i) => (
          <img
            key={i}
            src={logo}
            alt=""
            className="absolute -top-16 will-change-transform drop-shadow-[0_0_12px_hsl(43_95%_55%/0.55)]"
            style={{
              left: d.left,
              width: d.size,
              height: d.size,
              opacity: d.opacity,
              animation: `crown-rain ${d.dur}s linear ${d.delay}s infinite`,
            }}
          />
        ))}
      </div>

      {/* Center hero logo */}
      <div className="relative z-10 flex flex-col items-center">
        <div className="relative size-32">
          <div
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "radial-gradient(circle at center, hsl(43 95% 60% / 0.55), transparent 65%)",
              animation: "crown-halo 2.4s ease-in-out infinite",
            }}
          />
          <img
            src={logo}
            alt="CrownMe"
            className="relative w-full h-full object-contain animate-crown-pulse drop-shadow-[0_0_20px_hsl(43_90%_55%/0.6)]"
          />
        </div>
        <p className="mt-6 text-xs font-display tracking-[0.35em] uppercase text-gold">
          {label}
        </p>
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  );
}
