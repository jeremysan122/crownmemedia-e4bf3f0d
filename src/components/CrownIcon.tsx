import { Crown } from "lucide-react";

interface CrownIconProps {
  size?: number;
  className?: string;
  glow?: boolean;
}

export function CrownIcon({ size = 24, className = "", glow = false }: CrownIconProps) {
  return (
    <Crown
      size={size}
      className={`${glow ? "animate-crown-pulse text-primary" : "text-primary"} ${className}`}
      strokeWidth={2}
      fill="currentColor"
    />
  );
}
