import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import logo from "@/assets/crownme-logo.webp";
import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import CrownLoader from "@/components/CrownLoader";
import { getRememberedBottomTab } from "@/components/BottomNav";

export default function Splash() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { user, loading } = useAuth();
  useSeoMeta({
    title: "CrownMe Media — Earn the crown. Defend the throne.",
    description:
      "Join CrownMe, the 18+ social photo competition. Post, get voted, and climb city, country, and global leaderboards.",
  });
  useEffect(() => {
    const ref = params.get("ref");
    if (ref && ref.trim().length >= 4) {
      try { localStorage.setItem("crownme_invite_ref", ref.trim().toUpperCase()); } catch { /* noop */ }
    }
    if (!loading && user) {
      // Restore the last bottom-nav tab on returning visits (tablet/mobile),
      // falling back to the feed when nothing has been remembered yet.
      const remembered = getRememberedBottomTab();
      nav(remembered ?? "/feed", { replace: true });
    }
  }, [user, loading, nav, params]);

  if (loading) return <CrownLoader label="Preparing your throne…" />;

  return (
    <main className="min-h-screen flex flex-col items-center justify-between px-6 py-12 bg-gradient-royal">
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <div className="relative mb-8 animate-scale-in size-72">
          <img
            src={logo}
            alt="CrownMe Media"
            width={512}
            height={512}
            decoding="async"
            className="relative w-full h-full object-contain drop-shadow-[0_0_30px_hsl(43_90%_55%/0.45)]"
          />
        </div>
        <h1 className="sr-only">CrownMe Media — a social photo competition community for adults 18+</h1>
        <p className="font-display text-base text-muted-foreground tracking-wider animate-fade-in" style={{ animationDelay: "0.15s" }}>
          Earn the crown.
        </p>
        <p className="font-display text-base text-muted-foreground tracking-wider animate-fade-in" style={{ animationDelay: "0.3s" }}>
          Defend the throne.
        </p>
      </div>

      <div className="w-full max-w-sm space-y-3 animate-slide-up">
        <Button asChild size="lg" className="w-full h-14 bg-gradient-gold text-primary-foreground font-bold tracking-widest gold-shadow hover:opacity-95">
          <Link to="/auth?mode=signup">SIGN UP</Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="w-full h-14 border-primary/40 bg-card/40 text-foreground font-bold tracking-widest hover:bg-card/70">
          <Link to="/auth?mode=login">LOG IN</Link>
        </Button>
        <p className="text-center text-xs text-muted-foreground pt-2 flex items-center justify-center gap-x-2 gap-y-1 flex-wrap">
          <Link to="/conduct" className="hover:text-primary transition">Conduct</Link>
          <span aria-hidden>·</span>
          <Link to="/privacy" className="hover:text-primary transition">Privacy</Link>
          <span aria-hidden>·</span>
          <Link to="/terms" className="hover:text-primary transition">Terms</Link>
          <span aria-hidden>·</span>
          <a href="mailto:support@crownmemedia.com" className="hover:text-primary transition">Contact</a>
        </p>
        <p className="text-center text-[10px] text-muted-foreground/60">
          © {new Date().getFullYear()} CrownMe Media. All rights reserved.
        </p>
      </div>
    </main>
  );
}
