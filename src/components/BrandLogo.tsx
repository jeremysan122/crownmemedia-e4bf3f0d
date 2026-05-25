import logo from "@/assets/crownme-logo.png";

interface BrandLogoProps {
  size?: number;
  className?: string;
  glow?: boolean;
  priority?: boolean;
}

/**
 * Official CrownMe brand logo. This is the ONLY approved brand asset.
 * The optional glow uses a CSS mask of the same image so the halo follows
 * the actual logo silhouette instead of a generic circle.
 */
export default function BrandLogo({ size = 40, className = "", glow = false, priority = false }: BrandLogoProps) {
  if (!glow) {
    return (
      <img
        src={logo}
        alt="CrownMe Media"
        width={size}
        height={size}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
        className={`object-contain select-none ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  const maskStyle = {
    WebkitMaskImage: `url(${logo})`,
    maskImage: `url(${logo})`,
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskSize: "contain",
    maskSize: "contain",
    WebkitMaskPosition: "center",
    maskPosition: "center",
  } as const;

  return (
    <div
      className={`relative ${className}`}
      style={{ width: size, height: size }}
    >
      <div
        aria-hidden
        className="absolute inset-0 animate-crown-pulse"
        style={{
          ...maskStyle,
          backgroundColor: "hsl(43 95% 60% / 0.55)",
          filter: `blur(${Math.max(8, size * 0.08)}px)`,
          transform: "scale(1.08)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          ...maskStyle,
          backgroundColor: "hsl(270 80% 55% / 0.32)",
          filter: `blur(${Math.max(14, size * 0.16)}px)`,
          transform: "scale(1.16)",
        }}
      />
      <img
        src={logo}
        alt="CrownMe Media"
        width={size}
        height={size}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
        className="relative w-full h-full object-contain select-none"
      />
    </div>
  );
}
