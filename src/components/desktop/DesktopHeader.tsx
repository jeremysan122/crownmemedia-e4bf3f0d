import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, MessageCircle, Search, Plus } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import { useAuth } from "@/context/AuthContext";
import { useWallet } from "@/hooks/useWallet";
import { formatScore } from "@/lib/crown";
import GlobalSearchDialog from "@/components/GlobalSearchDialog";

export default function DesktopHeader() {
  const nav = useNavigate();
  const { profile } = useAuth();
  const { wallet } = useWallet();
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header className="hidden lg:block sticky top-0 z-40 glass border-b border-border/50">
      <div className="w-full h-[68px] px-6 flex items-center gap-6">
        <Link to="/feed" className="flex items-center shrink-0" aria-label="CrownMe home">
          <BrandLogo size={64} priority />
        </Link>

        <div className="flex-1 min-w-0">
          <button
            onClick={() => setSearchOpen(true)}
            className="relative w-full h-10 pl-10 pr-4 rounded-full bg-input/70 border border-border hover:border-primary/60 transition text-sm text-left text-muted-foreground/70"
          >
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            Search royals, cities, crowns…
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => nav("/store")}
            className="flex items-center gap-1.5 h-10 px-3 rounded-full bg-secondary/40 border border-secondary/60 hover:border-primary/60 transition text-sm"
            aria-label="Wallet"
          >
            <span className="text-gold font-bold">₪</span>
            <span className="font-bold tabular-nums">{formatScore(wallet.shekelBalance)}</span>
          </button>
          <Link to="/messages" className="size-10 rounded-full hover:bg-secondary/30 flex items-center justify-center text-muted-foreground hover:text-primary transition">
            <MessageCircle size={18} />
          </Link>
          <Link to="/notifications" className="size-10 rounded-full hover:bg-secondary/30 flex items-center justify-center text-muted-foreground hover:text-primary transition">
            <Bell size={18} />
          </Link>
          <button
            onClick={() => nav("/upload")}
            className="ml-1 h-10 px-4 rounded-full bg-gradient-gold text-primary-foreground font-bold text-sm tracking-wider gold-shadow flex items-center gap-1.5 hover:opacity-95 transition"
          >
            <Plus size={16} strokeWidth={2.6} /> Post
          </button>
          <Link to="/me" className="ml-1 size-10 rounded-full overflow-hidden ring-1 ring-border hover:ring-primary transition bg-muted shrink-0">
            {profile?.profile_photo_url ? (
              <img loading="lazy" src={profile.profile_photo_url} alt={profile.username} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs font-bold text-muted-foreground">
                {profile?.username?.[0]?.toUpperCase() ?? "?"}
              </div>
            )}
          </Link>
        </div>
      </div>
      <GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
}
