// Public crown share page — anonymous-friendly view for /crown/:slug.
// Fetches via the SECURITY DEFINER `get_public_crown_by_slug` RPC so it
// works with no session, and updates <head> tags for social crawlers that
// execute JS.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Crown as CrownIcon, Sparkles, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import CrownLoader from "@/components/CrownLoader";
import { formatOwnership } from "@/hooks/useCrownRarity";

interface PublicCrown {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  lore: string | null;
  rarity: string;
  tier_index: number;
  crown_number: number;
  collection_slug: string;
  collection_name: string;
  gallery_asset_url: string | null;
  thumbnail_url: string | null;
  asset_version: string | null;
  owners_count: number;
  total_players: number;
  ownership_pct: number;
}

const RARITY_STYLES: Record<string, string> = {
  common: "border-slate-400/40 text-slate-200 bg-slate-500/10",
  uncommon: "border-emerald-400/40 text-emerald-200 bg-emerald-500/10",
  rare: "border-sky-400/40 text-sky-200 bg-sky-500/10",
  epic: "border-fuchsia-400/40 text-fuchsia-200 bg-fuchsia-500/10",
  legendary: "border-amber-400/60 text-amber-200 bg-amber-500/10",
  mythic: "border-rose-400/60 text-rose-200 bg-rose-500/10",
};

function setMeta(name: string, value: string, isProperty = false) {
  const attr = isProperty ? "property" : "name";
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", value);
}

export default function PublicCrown() {
  const { slug } = useParams<{ slug: string }>();
  const [crown, setCrown] = useState<PublicCrown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: e } = await (supabase as any).rpc("get_public_crown_by_slug", { _slug: slug });
        if (e) throw e;
        const row = (Array.isArray(data) ? data[0] : data) as PublicCrown | undefined;
        if (cancelled) return;
        if (!row) { setError("Crown not found"); setCrown(null); }
        else setCrown(row);
      } catch (e) {
        if (!cancelled) setError((e as Error).message || "Failed to load crown");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    if (!crown) return;
    const title = `${crown.name} — CrownMe Achievement Crown`;
    const desc = crown.description
      ? `${crown.description} · ${crown.collection_name} · ${crown.rarity.toUpperCase()} · Owned by ${formatOwnership(crown.ownership_pct)} of players.`
      : `${crown.collection_name} · ${crown.rarity.toUpperCase()} Achievement Crown on CrownMe.`;
    const url = `https://crownmemedia.com/crown/${crown.slug}`;
    const image = crown.gallery_asset_url || crown.thumbnail_url || "";
    document.title = title;
    setMeta("description", desc);
    setMeta("og:title", title, true);
    setMeta("og:description", desc, true);
    setMeta("og:type", "article", true);
    setMeta("og:url", url, true);
    if (image) setMeta("og:image", image, true);
    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:title", title);
    setMeta("twitter:description", desc);
    if (image) setMeta("twitter:image", image);
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) { link = document.createElement("link"); link.rel = "canonical"; document.head.appendChild(link); }
    link.href = url;
  }, [crown]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><CrownLoader /></div>;
  }

  if (error || !crown) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <CrownIcon className="text-gold" size={40} />
        <h1 className="font-display text-2xl text-gold">Crown not found</h1>
        <p className="text-muted-foreground text-sm max-w-md">
          The crown you're looking for doesn't exist or is no longer available.
        </p>
        <Link to="/achievement-crowns"><Button variant="secondary">Browse all crowns</Button></Link>
      </div>
    );
  }

  const rarityStyle = RARITY_STYLES[crown.rarity] ?? RARITY_STYLES.common;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <CrownIcon className="text-gold" size={22} />
            <span className="font-display text-gold text-lg">CrownMe</span>
          </Link>
          <Link to="/auth"><Button size="sm" variant="secondary">Sign in</Button></Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-10 grid md:grid-cols-2 gap-8 items-start">
        <div className="relative aspect-square rounded-2xl border border-gold/20 bg-gradient-to-b from-gold/10 to-transparent flex items-center justify-center p-8">
          <img
            src={crown.gallery_asset_url || crown.thumbnail_url || ""}
            alt={crown.name}
            className="w-full h-full object-contain drop-shadow-[0_0_36px_hsl(var(--gold)/0.45)]"
          />
          <div className="absolute top-3 left-3 rounded-full bg-background/70 backdrop-blur-sm border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            #{String(crown.crown_number).padStart(3, "0")}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`rounded-full border px-2 py-0.5 uppercase tracking-wider text-[10px] font-bold ${rarityStyle}`}>
              {crown.rarity}
            </span>
            <span className="text-xs uppercase tracking-wider text-gold/80">{crown.collection_name}</span>
          </div>

          <h1 className="mt-3 font-display text-4xl md:text-5xl text-gold leading-tight">{crown.name}</h1>

          {crown.description && (
            <p className="mt-4 text-base text-muted-foreground leading-relaxed">{crown.description}</p>
          )}
          {crown.lore && (
            <p className="mt-3 text-sm italic text-muted-foreground/80 leading-relaxed border-l-2 border-gold/30 pl-3">
              "{crown.lore}"
            </p>
          )}

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border/60 bg-card/60 p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Sparkles size={11} /> Owners
              </div>
              <div className="mt-1 font-display text-2xl text-gold tabular-nums">
                {crown.owners_count.toLocaleString()}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {formatOwnership(crown.ownership_pct)} of players
              </div>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/60 p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Collection tier</div>
              <div className="mt-1 font-display text-2xl text-gold tabular-nums">
                {crown.tier_index} / 10
              </div>
              <div className="text-[11px] text-muted-foreground">{crown.collection_name}</div>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/auth" state={{ from: `/crown/${crown.slug}` }}>
              <Button className="gap-2">
                Claim your own crowns <ArrowRight size={16} />
              </Button>
            </Link>
            <Link to="/achievement-crowns">
              <Button variant="secondary">Browse all 100 crowns</Button>
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t border-border/60 mt-16">
        <div className="max-w-4xl mx-auto px-4 py-6 text-center text-xs text-muted-foreground">
          Achievement Crowns are earned by playing on <Link to="/" className="text-gold hover:underline">CrownMe</Link>.
        </div>
      </footer>
    </div>
  );
}
