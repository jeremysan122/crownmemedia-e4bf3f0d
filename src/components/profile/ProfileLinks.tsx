import { Link2 } from "lucide-react";

export interface ProfileLink {
  label?: string;
  url: string;
}

export default function ProfileLinks({ links }: { links: unknown }) {
  const list = Array.isArray(links) ? (links as ProfileLink[]).slice(0, 3) : [];
  if (list.length === 0) return null;

  const hostFor = (url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  };

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {list.map((l, i) => (
        <a
          key={i}
          href={l.url}
          target="_blank"
          rel="noopener noreferrer ugc"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/40 border border-border text-[11px] font-semibold hover:border-primary/40 hover:text-primary transition max-w-[220px] truncate"
          title={l.url}
        >
          <Link2 size={10} className="text-primary shrink-0" />
          <span className="truncate">{l.label?.trim() || hostFor(l.url)}</span>
        </a>
      ))}
    </div>
  );
}
