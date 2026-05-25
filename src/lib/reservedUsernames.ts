// Usernames that look like CrownMe staff, system pages, or are abusive.
// Used client-side to fail-fast before submitting. Server should still enforce.
export const RESERVED_USERNAMES = new Set<string>([
  "admin", "administrator", "root", "owner", "staff", "team", "support",
  "help", "crownme", "crown", "official", "system", "moderator", "mod",
  "security", "billing", "legal", "abuse", "report", "api", "auth", "login",
  "signup", "register", "logout", "feed", "battles", "leaderboard", "store",
  "wallet", "settings", "profile", "me", "you", "anonymous", "null", "undefined",
  "ceo", "founder", "king", "queen", "royalty",
]);

export function isReservedUsername(name: string): boolean {
  return RESERVED_USERNAMES.has(name.trim().toLowerCase());
}
