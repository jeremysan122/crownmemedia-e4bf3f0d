// Lightweight password strength scoring (0-4).
export type PwScore = {
  score: 0 | 1 | 2 | 3 | 4;
  label: "Very weak" | "Weak" | "Okay" | "Strong" | "Royal";
  color: string;
  hints: string[];
};

export function scorePassword(pw: string): PwScore {
  const hints: string[] = [];
  let score = 0;
  if (pw.length >= 8) score++; else hints.push("8+ characters");
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++; else hints.push("upper & lower case");
  if (/\d/.test(pw)) score++; else hints.push("a number");
  if (/[^A-Za-z0-9]/.test(pw)) score++; else hints.push("a symbol");
  // common weak patterns
  if (/^(password|qwerty|12345678|letmein|crownme)/i.test(pw)) score = Math.min(score, 1);

  const clamped = Math.max(0, Math.min(4, score - 1)) as 0 | 1 | 2 | 3 | 4;
  const map: Record<number, { label: PwScore["label"]; color: string }> = {
    0: { label: "Very weak", color: "bg-destructive" },
    1: { label: "Weak", color: "bg-orange-500" },
    2: { label: "Okay", color: "bg-yellow-500" },
    3: { label: "Strong", color: "bg-emerald-500" },
    4: { label: "Royal", color: "bg-gold" },
  };
  return { score: clamped, ...map[clamped], hints };
}
