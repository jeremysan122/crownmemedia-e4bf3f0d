// Shared origin allowlist for Stripe redirect URLs (open-redirect protection).
const ALLOWED_ORIGINS = [
  "https://crownmemedia.lovable.app",
  "https://www.crownmemedia.com",
  "https://crownmemedia.com",
  "https://www.holdthecrown.com",
  "https://holdthecrown.com",
  "https://id-preview--fcbd98f7-a452-4e42-a0f9-b92cfce5c620.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];

const ALLOWED_HOST_SUFFIXES = [
  ".crownmemedia.com",
  ".holdthecrown.com",
];

const DEFAULT_ORIGIN = "https://crownmemedia.com";

export function safeOrigin(req: Request): string {
  const raw = req.headers.get("origin") ?? "";
  if (!raw) return DEFAULT_ORIGIN;
  if (ALLOWED_ORIGINS.includes(raw)) return raw;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.hostname !== "localhost") return DEFAULT_ORIGIN;
    if (ALLOWED_HOST_SUFFIXES.some((s) => u.hostname.endsWith(s))) {
      return `${u.protocol}//${u.host}`;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_ORIGIN;
}

/**
 * Build a safe return URL that always lands on the same origin the user came
 * from, with a sanitized path. Falls back to defaultPath if path is missing
 * or unsafe (must start with "/", no protocol, no double-slash).
 */
export function safeReturnUrl(req: Request, path: string | null | undefined, defaultPath = "/settings"): string {
  const origin = safeOrigin(req);
  let p = (path ?? "").trim();
  if (!p || !p.startsWith("/") || p.startsWith("//") || p.includes("://")) {
    p = defaultPath;
  }
  // Strip any trailing query/hash to keep it predictable; caller appends params.
  p = p.split("?")[0].split("#")[0];
  if (p.length > 256) p = defaultPath;
  return `${origin}${p}`;
}
