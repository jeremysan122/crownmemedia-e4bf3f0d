// Small blur+icon overlay for grid thumbnails (Profile posts/liked/saved).
// Differs from SensitiveOverlay in that it is purely visual — clicking the
// thumbnail still navigates to PostDetail, where the full reveal UI lives.
import { EyeOff } from "lucide-react";

interface Props {
  /** Active when the viewer should NOT see the media in clear. */
  blurred: boolean;
}

export default function SensitiveThumb({ blurred }: Props) {
  if (!blurred) return null;
  return (
    <div
      aria-label="Sensitive content hidden"
      className="absolute inset-0 z-10 flex items-center justify-center bg-background/40 backdrop-blur-md pointer-events-none"
    >
      <EyeOff size={16} className="text-gold drop-shadow" />
    </div>
  );
}
