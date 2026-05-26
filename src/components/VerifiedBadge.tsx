import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface VerifiedBadgeProps {
  className?: string;
  size?: number;
  title?: string;
}

/**
 * Blue verified checkmark. Render inline next to a username.
 * Use `verified` boolean from the profiles table to decide whether to mount this.
 */
export default function VerifiedBadge({ className, size = 16, title = "Verified" }: VerifiedBadgeProps) {
  return (
    <CheckCircle2
      role="img"
      aria-label={title}
      width={size}
      height={size}
      className={cn("inline-block shrink-0 fill-sky-500 text-background", className)}
    />
  );
}
