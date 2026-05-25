import { useEffect } from "react";

export interface SeoMeta {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: "website" | "article" | "profile";
}

const DEFAULTS = {
  title: "CrownMe — Earn the crown. Defend the throne.",
  description:
    "The 18+ luxury social competition. Post, get voted, climb the leaderboard, and claim the crown of your city, country, and the world.",
  image: "/og-image.png",
  type: "website" as const,
};

function setMeta(selector: string, attr: "content" | "href", value: string) {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (!el) {
    if (selector.startsWith('meta[property="')) {
      const property = selector.match(/property="([^"]+)"/)?.[1] ?? "";
      el = document.createElement("meta");
      el.setAttribute("property", property);
      document.head.appendChild(el);
    } else if (selector.startsWith('meta[name="')) {
      const name = selector.match(/name="([^"]+)"/)?.[1] ?? "";
      el = document.createElement("meta");
      el.setAttribute("name", name);
      document.head.appendChild(el);
    } else if (selector === 'link[rel="canonical"]') {
      el = document.createElement("link");
      el.setAttribute("rel", "canonical");
      document.head.appendChild(el);
    } else {
      return;
    }
  }
  el.setAttribute(attr, value);
}

/**
 * Updates document <title> + OpenGraph + Twitter card meta on the fly so every
 * shared link surfaces the official CrownMe branding (dynamic image included).
 */
export function useSeoMeta(meta: SeoMeta = {}) {
  useEffect(() => {
    const title = meta.title ?? DEFAULTS.title;
    const description = meta.description ?? DEFAULTS.description;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const path = typeof window !== "undefined" ? window.location.pathname + window.location.search : "";
    const url = meta.url ?? `${origin}${path}`;
    const rawImage = meta.image ?? DEFAULTS.image;
    const image = rawImage.startsWith("http") ? rawImage : `${origin}${rawImage}`;
    const type = meta.type ?? DEFAULTS.type;

    document.title = title;

    setMeta('meta[name="description"]', "content", description);
    setMeta('link[rel="canonical"]', "href", url);

    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", description);
    setMeta('meta[property="og:image"]', "content", image);
    setMeta('meta[property="og:image:width"]', "content", "1200");
    setMeta('meta[property="og:image:height"]', "content", "630");
    setMeta('meta[property="og:image:alt"]', "content", "CrownMe");
    setMeta('meta[property="og:url"]', "content", url);
    setMeta('meta[property="og:type"]', "content", type);
    setMeta('meta[property="og:site_name"]', "content", "CrownMe");

    setMeta('meta[name="twitter:card"]', "content", "summary_large_image");
    setMeta('meta[name="twitter:title"]', "content", title);
    setMeta('meta[name="twitter:description"]', "content", description);
    setMeta('meta[name="twitter:image"]', "content", image);
    setMeta('meta[name="twitter:image:alt"]', "content", "CrownMe");
  }, [meta.title, meta.description, meta.image, meta.url, meta.type]);
}

/**
 * Build a per-profile OG image URL. We use the canonical brand OG image as the
 * static base and append a query param so platforms that re-crawl pick up the
 * profile context (and so links look distinct in scrapers/analytics).
 */
export function buildProfileOgImage(username?: string) {
  if (!username) return DEFAULTS.image;
  return `/og-image.png?u=${encodeURIComponent(username)}`;
}

/** Build a per-post OG image URL (same canonical brand image, post-tagged). */
export function buildPostOgImage(postId?: string, fallbackImage?: string) {
  if (fallbackImage) return fallbackImage;
  if (!postId) return DEFAULTS.image;
  return `/og-image.png?p=${encodeURIComponent(postId)}`;
}
