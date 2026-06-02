// Floating "back to top" pill — only mounts after the user has scrolled past
// a threshold, sits above the mobile bottom nav, and smooth-scrolls on tap
// (jumps instantly when prefers-reduced-motion is set).
import { useEffect, useState } from "react";
import { ChevronUp } from "lucide-react";

export default function BackToTopButton({ threshold = 1200 }: { threshold?: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  if (!visible) return null;

  const handleClick = () => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    try {
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    } catch {
      window.scrollTo(0, 0);
    }
  };

  return (
    <button
      onClick={handleClick}
      aria-label="Back to top"
      className="fixed right-4 z-40 inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-full bg-gradient-gold text-primary-foreground text-xs font-bold gold-shadow shadow-lg animate-fade-in
        bottom-24 lg:bottom-6
        min-h-11 min-w-11"
    >
      <ChevronUp size={16} /> Top
    </button>
  );
}
