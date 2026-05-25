import { Crown } from "lucide-react";

interface RoyalPassBadgeProps {
  size?: "sm" | "md";
  showLabel?: boolean;
  className?: string;
}

export default function RoyalPassBadge({
  size = "sm",
  showLabel = false,
  className = "",
}: RoyalPassBadgeProps) {
  const dim = size === "sm" ? 12 : 14;
  return (
    <span
      title="Royal Pass member"
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-gradient-gold text-primary-foreground text-[10px] font-bold uppercase tracking-wider gold-shadow ${className}`}
    >
      <Crown size={dim} />
      {showLabel && <span>Royal Pass</span>}
    </span>
  );
}
