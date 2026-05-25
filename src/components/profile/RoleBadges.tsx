import { Shield, ShieldCheck, Sparkles } from "lucide-react";

interface Props {
  roles: string[];
  crownsHeld: number;
}

/** Compact role/verified badges shown next to a username. */
export default function RoleBadges({ roles, crownsHeld }: Props) {
  const isAdmin = roles.includes("admin");
  const isMod = roles.includes("moderator");
  const isTopCreator = crownsHeld >= 3;

  if (!isAdmin && !isMod && !isTopCreator) return null;

  return (
    <div className="flex items-center gap-1">
      {isAdmin && (
        <span
          title="Admin"
          className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 text-primary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider border border-primary/30"
        >
          <ShieldCheck size={10} /> Admin
        </span>
      )}
      {!isAdmin && isMod && (
        <span
          title="Moderator"
          className="inline-flex items-center gap-0.5 rounded-full bg-accent/20 text-accent-foreground px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider border border-accent/30"
        >
          <Shield size={10} /> Mod
        </span>
      )}
      {isTopCreator && (
        <span
          title={`${crownsHeld} crowns held`}
          className="inline-flex items-center gap-0.5 rounded-full bg-gradient-gold text-primary-foreground px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
        >
          <Sparkles size={10} /> Top
        </span>
      )}
    </div>
  );
}
