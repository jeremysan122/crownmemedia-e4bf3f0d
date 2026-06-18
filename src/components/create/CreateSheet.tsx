import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Image as ImageIcon, Clapperboard, FileText, Bookmark, X } from "lucide-react";
import { CrownIcon } from "@/components/CrownIcon";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/**
 * Instagram-style "+" composer entry sheet.
 * Tabs: Post · Scroll. Selecting one routes to /upload?type=<...>
 * The heavy multi-step composer (crop, filter, details) already lives on
 * the Upload page — this sheet is purely a unified entry surface so a single
 * `+` button in the bottom nav can fork between content types the IG way.
 */
export default function CreateSheet({ open, onOpenChange }: Props) {
  const nav = useNavigate();

  const go = (type: "post" | "scroll") => {
    onOpenChange(false);
    nav(`/upload?type=${type}`);
  };

  const Tile = ({
    icon: Icon,
    title,
    subtitle,
    onClick,
    primary,
  }: {
    icon: typeof ImageIcon;
    title: string;
    subtitle: string;
    onClick: () => void;
    primary?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 w-full px-4 py-4 rounded-2xl border transition active:scale-[0.99] ${
        primary
          ? "bg-gradient-gold text-primary-foreground border-transparent gold-shadow"
          : "bg-card/60 border-border hover:border-primary/60 hover:bg-card"
      }`}
    >
      <span
        className={`size-12 shrink-0 rounded-xl flex items-center justify-center ${
          primary ? "bg-black/15" : "bg-muted"
        }`}
      >
        <Icon size={22} />
      </span>
      <span className="flex-1 text-left">
        <span className="block font-display text-base leading-tight">{title}</span>
        <span className={`block text-xs ${primary ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
          {subtitle}
        </span>
      </span>
    </button>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl border-t border-border/70 p-0 max-h-[88dvh] overflow-y-auto"
      >
        <SheetHeader className="px-5 pt-5 pb-2 flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <CrownIcon className="size-5 text-primary" />
            <SheetTitle className="font-display tracking-wide text-base">Create</SheetTitle>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="p-2 -mr-2 rounded-full text-muted-foreground hover:bg-muted"
          >
            <X size={18} />
          </button>
        </SheetHeader>

        <div className="px-4 pt-2 pb-6 space-y-2.5">
          <Tile
            icon={ImageIcon}
            title="Post"
            subtitle="Photo or short video for the main feed and your profile grid"
            primary
            onClick={() => go("post")}
          />
          <Tile
            icon={Clapperboard}
            title="Scroll"
            subtitle="Vertical 9:16 short, up to 30 seconds, for the Scrolls feed"
            onClick={() => go("scroll")}
          />

          <div className="pt-3 pb-1 px-1 text-[11px] uppercase tracking-widest text-muted-foreground">
            More
          </div>
          <Tile
            icon={FileText}
            title="Drafts"
            subtitle="Continue something you started earlier"
            onClick={() => {
              onOpenChange(false);
              nav("/drafts");
            }}
          />
          <Tile
            icon={Bookmark}
            title="Archived"
            subtitle="View posts you've archived from your profile"
            onClick={() => {
              onOpenChange(false);
              nav("/archived");
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
