import { Crown } from "lucide-react";

export default function GiftPanelHeader({
  username,
  avatarUrl,
}: {
  username: string;
  avatarUrl?: string | null;
}) {
  return (
    <header className="px-5 pt-2 pb-4 flex items-center justify-between">
      <div>
        <h2 className="font-display text-xl text-gold leading-none">Send a Royal Gift</h2>
        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
          <Crown size={12} className="text-primary" fill="currentColor" />
          To
          <span className="font-semibold text-foreground">@{username}</span>
        </p>
      </div>
      <div className="crown-ring">
        <div className="size-12 rounded-full bg-muted overflow-hidden ring-1 ring-border">
          {avatarUrl ? (
            <img loading="lazy" src={avatarUrl} alt={username} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-sm font-bold">
              {username[0]?.toUpperCase()}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
