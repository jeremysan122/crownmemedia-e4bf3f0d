// Usernames that collide with app routes, look like CrownMe staff, or are abusive.
// Because /:username is a root-level dynamic route, every existing static route
// path MUST appear here or it would be unreachable if claimed as a username.
// Server-side validation should also enforce this list.
export const RESERVED_USERNAMES = new Set<string>([
  // Brand / staff / system
  "admin", "administrator", "root", "owner", "staff", "team", "support",
  "help", "crownme", "crown", "official", "system", "moderator", "mod",
  "security", "billing", "legal", "abuse", "report", "accountrecovery", "anonymous", "null",
  "undefined", "ceo", "founder", "king", "queen", "royalty",

  // App routes (must mirror src/App.tsx) — keep alphabetised
  "account", "acceptable-use", "appeals", "archived", "auth", "battles",
  "blocked", "c", "compliance", "conduct", "contact", "contact-legal",
  "cookies", "creator", "csae-policy", "discover", "dmca", "drafts",
  "edit-profile", "eula", "feed", "insights", "invite", "leaderboard",
  "leaderboards", "legal", "login", "logout", "map", "me", "messages",
  "muted-words", "notifications", "onboarding", "p", "pending", "post",
  "preferences", "privacy", "profile", "register", "reports",
  "reset-password", "restricted", "rewards", "royal-pass", "scrolls",
  "search", "sensitive-content", "settings", "shorts", "signup", "store",
  "subscription-terms", "terms", "u", "unsubscribe", "upload",
  "verification", "verify-age", "virtual-goods", "wallet",

  // Asset / SEO paths served from /public
  "api", "robots.txt", "sitemap.xml", "favicon.ico", "manifest.json",
  "site.webmanifest", "sw.js", "placeholder.svg", "llms.txt", "og-image.png",
  "robots", "sitemap",
]);

export function isReservedUsername(name: string): boolean {
  return RESERVED_USERNAMES.has(name.trim().toLowerCase());
}
