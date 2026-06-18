import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Instagram, Twitter, Facebook, Crown, Download, Loader2 } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import RoleBadges from "@/components/profile/RoleBadges";
import { toast } from "sonner";
import { formatScore, locationLabel } from "@/lib/crown";
import { toPng } from "html-to-image";
import { supabase } from "@/integrations/supabase/client";
import { withCacheBust } from "@/lib/cacheBust";

interface Profile {
  id?: string;
  username: string;
  profile_photo_url: string | null;
  banner_url: string | null;
  bio: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  crowns_held: number;
  followers_count: number;
  votes_received: number;
  updated_at?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  profile: Profile;
  roles?: string[];
}


/** Wait for every <img> inside the node to finish loading so html-to-image
 * doesn't capture before the avatar / banner has actually painted. */
async function waitForImages(node: HTMLElement) {
  const imgs = Array.from(node.querySelectorAll("img"));
  await Promise.all(
    imgs.map((img) =>
      img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          }),
    ),
  );
}

export default function ShareProfileDialog({ open, onOpenChange, profile: initial, roles = [] }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [profile, setProfile] = useState<Profile>(initial);

  useEffect(() => { setProfile(initial); }, [initial.username, initial.id]);

  // Refetch the freshest profile on open — guarantees the share card matches
  // the current avatar, bio, crown count, etc. (not what the parent had cached).
  useEffect(() => {
    if (!open || !initial.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, profile_photo_url, banner_url, bio, city, state, country, crowns_held, followers_count, votes_received, updated_at")
        .eq("id", initial.id)
        .maybeSingle();
      if (!cancelled && data) setProfile((p) => ({ ...p, ...(data as Partial<Profile>) }));
    })();
    return () => { cancelled = true; };
  }, [open, initial.id]);

  const v = profile.updated_at ?? undefined;
  const avatarSrc = withCacheBust(profile.profile_photo_url, v);
  const bannerSrc = withCacheBust(profile.banner_url, v);

  const url = `${window.location.origin}/${profile.username}`;
  const text = `Follow @${profile.username} on CrownMe — competing for the crown.`;

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    toast.success("Profile link copied");
  };
  const open_url = (u: string) => window.open(u, "_blank");

  const downloadCard = async () => {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      // Make sure avatar + banner have painted before snapshotting, otherwise
      // html-to-image renders the card with the image slots empty.
      await waitForImages(cardRef.current);
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 3,
        cacheBust: true,
        backgroundColor: "#0b0918",
        fetchRequestInit: { mode: "cors", credentials: "omit" },
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `crownme-${profile.username}.png`;
      a.click();
      toast.success("Share card saved");
    } catch (err: any) {
      toast.error(err?.message || "Could not generate image");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-sm sm:max-w-md bg-card border-border max-h-[92dvh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="font-display text-gold text-base sm:text-lg">Share this royal profile</DialogTitle>
        </DialogHeader>

        {/* Premium share card preview */}
        <div
          ref={cardRef}
          className="relative rounded-2xl overflow-hidden bg-gradient-royal border border-primary/40 my-2"
        >
          {/* Cover banner header */}
          <div className="relative h-20 sm:h-24 overflow-hidden">
            {bannerSrc ? (
              <img loading="eager" src={bannerSrc} alt="" crossOrigin="anonymous" className="w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, hsl(43 95% 60%), hsl(270 80% 55%))" }} />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />
            {/* Brand lockup pinned top-left */}
            <div className="absolute top-2 left-2.5 flex items-center gap-1.5">
              <BrandLogo size={26} priority className="drop-shadow-[0_2px_8px_hsl(43_95%_60%/0.5)]" />
            </div>
          </div>

          <div className="px-4 sm:px-5 pb-4 -mt-9 sm:-mt-10 relative">
            {/* Avatar centered overlapping banner */}
            <div className="flex flex-col items-center text-center">
              <div className={`${profile.crowns_held > 0 ? "crown-ring" : ""} mb-2`}>
                <div className="size-[72px] sm:size-20 rounded-full overflow-hidden bg-muted ring-[3px] ring-background flex items-center justify-center">
                  {avatarSrc ? (
                    <img loading="eager" src={avatarSrc} crossOrigin="anonymous" className="w-full h-full object-cover" alt="" />
                  ) : (
                    <span className="w-full h-full block" style={{ background: "linear-gradient(135deg, hsl(43 95% 60%), hsl(43 85% 45%))" }} />
                  )}
                </div>
              </div>

              {/* Username + crown icon — wraps cleanly on tiny screens */}
              <div className="flex items-center justify-center gap-1.5 max-w-full">
                <p className="text-[15px] sm:text-base font-bold truncate max-w-[14ch] sm:max-w-[20ch]">@{profile.username}</p>
                {profile.crowns_held > 0 && <Crown size={14} className="text-primary shrink-0" fill="currentColor" />}
              </div>

              {/* Badges on their own row to avoid overlap on small screens */}
              <div className="mt-1 min-h-[16px] flex items-center justify-center">
                <RoleBadges roles={roles} crownsHeld={profile.crowns_held} />
              </div>

              <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5 truncate max-w-full">
                {locationLabel(profile)}
              </p>

              {profile.bio && (
                <p className="text-[11px] sm:text-xs mt-1.5 line-clamp-2 text-foreground/80 max-w-[32ch]">
                  {profile.bio}
                </p>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2 mt-3">
              {[
                { v: profile.crowns_held, l: "Crowns" },
                { v: profile.followers_count, l: "Followers" },
                { v: profile.votes_received, l: "Votes" },
              ].map((s) => (
                <div key={s.l} className="rounded-lg bg-background/50 border border-primary/15 py-1.5 text-center">
                  <div className="font-display text-sm text-gold leading-tight">{formatScore(s.v)}</div>
                  <div className="text-[8px] sm:text-[9px] text-muted-foreground uppercase tracking-wider">{s.l}</div>
                </div>
              ))}
            </div>

            <p className="font-display text-[10px] sm:text-xs text-primary tracking-wide text-center mt-3 italic">
              Where every photo competes for a crown.
            </p>
          </div>
        </div>

        {/* Download as image */}
        <Button
          variant="outline"
          onClick={downloadCard}
          disabled={downloading}
          className="w-full border-primary/40 hover:bg-primary/10"
        >
          {downloading ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Download size={14} className="mr-1.5" />}
          {downloading ? "Generating…" : "Download share card"}
        </Button>

        <div className="grid grid-cols-4 gap-2">
          <Button variant="outline" size="sm" onClick={() => open_url(`https://www.instagram.com/`)} className="flex-col h-16">
            <Instagram size={20} /><span className="text-[10px]">Instagram</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => open_url(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`)} className="flex-col h-16">
            <Twitter size={20} /><span className="text-[10px]">X</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => open_url(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`)} className="flex-col h-16">
            <Facebook size={20} /><span className="text-[10px]">Facebook</span>
          </Button>
          <Button variant="outline" size="sm" onClick={copy} className="flex-col h-16">
            <Copy size={20} /><span className="text-[10px]">Copy</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
