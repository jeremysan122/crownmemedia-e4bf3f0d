import { useEffect } from "react";

export interface SeoMeta {
  /** Page title. Appended with " · CrownMe" unless it already contains "CrownMe". */
  title?: string;
  /** Meta description. Defaults to the brand description. */
  description?: string;
  /** Absolute URL or root-relative path for og:image. */
  image?: string;
  /** Canonical URL. Defaults to window.location.href. */
  url?: string;
  /** og:type — "website" (default), "article", or "profile". */
  type?: "website" | "article" | "profile";
  /** Set true on private/auth/admin pages so Google doesn't index them. */
  noIndex?: boolean;
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
 * Updates document <title> + OpenGraph + Twitter card + robots meta on the fly
 * so every page and shared link surfaces the right brand content.
 *
 * Set `noIndex: true` on auth/admin/settings pages so Google ignores them.
 * Defaults are restored automatically on unmount.
 */
export function useSeoMeta(meta: SeoMeta = {}) {
  useEffect(() => {
    const title = meta.title ?? DEFAULTS.title;
    const description = meta.description ?? DEFAULTS.description;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const path =
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "";
    const url = meta.url ?? `${origin}${path}`;
    const rawImage = meta.image ?? DEFAULTS.image;
    const image = rawImage.startsWith("http") ? rawImage : `${origin}${rawImage}`;
    const type = meta.type ?? DEFAULTS.type;

    document.title = title;

    // Core
    setMeta('meta[name="description"]', "content", description);
    setMeta('link[rel="canonical"]', "href", url);

    // Robots — noindex for private/auth pages, index everywhere else
    setMeta(
      'meta[name="robots"]',
      "content",
      meta.noIndex ? "noindex,nofollow" : "index,follow",
    );

    // OpenGraph
    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", description);
    setMeta('meta[property="og:image"]', "content", image);
    setMeta('meta[property="og:image:width"]', "content", "1200");
    setMeta('meta[property="og:image:height"]', "content", "630");
    setMeta('meta[property="og:image:alt"]', "content", title);
    setMeta('meta[property="og:url"]', "content", url);
    setMeta('meta[property="og:type"]', "content", type);
    setMeta('meta[property="og:site_name"]', "content", "CrownMe");
    setMeta('meta[property="og:locale"]', "content", "en_US");

    // Twitter / X Card
    setMeta('meta[name="twitter:card"]', "content", "summary_large_image");
    setMeta('meta[name="twitter:title"]', "content", title);
    setMeta('meta[name="twitter:description"]', "content", description);
    setMeta('meta[name="twitter:image"]', "content", image);
    setMeta('meta[name="twitter:image:alt"]', "content", title);
    setMeta('meta[name="twitter:site"]', "content", "@CrownMeMedia");
  }, [meta.title, meta.description, meta.image, meta.url, meta.type, meta.noIndex]);

  // Restore defaults on unmount so next page starts clean
  useEffect(() => {
    return () => {
      document.title = DEFAULTS.title;
      setMeta('meta[name="description"]', "content", DEFAULTS.description);
      setMeta('meta[name="robots"]', "content", "index,follow");
      setMeta('meta[property="og:title"]', "content", DEFAULTS.title);
      setMeta('meta[property="og:description"]', "content", DEFAULTS.description);
      setMeta('meta[property="og:image"]', "content", DEFAULTS.image);
      setMeta('meta[property="og:image:alt"]', "content", DEFAULTS.title);
      setMeta('meta[property="og:type"]', "content", "website");
      setMeta('meta[name="twitter:title"]', "content", DEFAULTS.title);
      setMeta('meta[name="twitter:description"]', "content", DEFAULTS.description);
      setMeta('meta[name="twitter:image"]', "content", DEFAULTS.image);
      setMeta('meta[name="twitter:image:alt"]', "content", DEFAULTS.title);
    };
  }, []);
}

/**
 * Build a per-profile OG image URL.
 * NOTE: Currently returns the static brand image with a query param so
 * analytics / scrapers see unique URLs per profile. A real dynamic OG image
 * (generated server-side) can slot in here later without touching call sites.
 */
export function buildProfileOgImage(username?: string) {
  if (!username) return DEFAULTS.image;
  return `/og-image.png?u=${encodeURIComponent(username)}`;
}

/** Build a per-post OG image URL — prefers the actual post thumbnail. */
export function buildPostOgImage(postId?: string, fallbackImage?: string) {
  if (fallbackImage?.startsWith("http")) return fallbackImage;
  if (postId) return `/og-image.png?p=${encodeURIComponent(postId)}`;
  return DEFAULTS.image;
}
