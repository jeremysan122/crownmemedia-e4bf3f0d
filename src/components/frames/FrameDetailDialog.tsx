// Full-screen detail view for a single Royal Avatar Frame.
// Shows the uncropped artwork, the achievement's exact "How to unlock"
// requirement, and links to every artwork source (static / animated /
// thumbnail) so admins and curious users can inspect the raw assets.
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Check, Lock, Sparkles, ExternalLink } from "lucide-react";
import FrameArtwork, { buildFrameSources } from "@/components/frames/FrameArtwork";
import type { FrameGalleryItem } from "@/hooks/useFrameGallery";
import { extractRequirements, formatRequirementLine } from "@/lib/frameUnlockText";

interface Props {
  item: FrameGalleryItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEquip: (item: FrameGalleryItem, unequip: boolean) => void;
  busy?: boolean;
  disabled?: boolean;
}

const SOURCE_LABELS: Array<{ key: keyof NonNullable<FrameGalleryItem["frame"]>; label: string }> = [
  { key: "static_asset_url" as any, label: "Static" },
  { key: "animated_asset_url" as any, label: "Animated" },
  { key: "thumbnail_asset_url" as any, label: "Thumbnail" },
];

export default function FrameDetailDialog({ item, open, onOpenChange, onEquip, busy, disabled }: Props) {
  if (!item) return null;
  const { frame, collection, achievement, ownership } = item;
  const unlocked = !!ownership;
  const equipped = !!ownership?.equipped;
  const requirements = achievement ? extractRequirements(achievement.requirement_logic) : [];
  const availableSources = buildFrameSources(frame);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="frame-detail-dialog"
        className="max-w-3xl w-[95vw] max-h-[95vh] overflow-y-auto p-0 bg-background border-gold/30"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
          {/* Left: uncropped artwork stage */}
          <div className="relative aspect-square bg-gradient-to-br from-black/60 to-black/20 flex items-center justify-center p-6 border-b md:border-b-0 md:border-r border-gold/20">
            <div className="w-full h-full max-w-md max-h-md">
              <FrameArtwork frame={frame} name={frame.name} locked={!unlocked} contain />
            </div>
            {equipped && (
              <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-gold/20 border border-gold/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
                <Check size={10} /> Equipped
              </span>
            )}
            <span
              className={`absolute top-3 left-3 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${
                unlocked
                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
                  : "bg-muted/60 text-muted-foreground border-border"
              }`}
            >
              {unlocked ? "Unlocked" : "Locked"}
            </span>
          </div>

          {/* Right: metadata */}
          <div className="p-6 flex flex-col gap-4">
            <DialogHeader className="text-left space-y-1">
              <DialogTitle className="font-display text-2xl text-gold">{frame.name}</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {collection?.name ?? "Royal Collection"}
                {frame.rarity ? ` · ${frame.rarity}` : ""}
              </DialogDescription>
            </DialogHeader>

            {frame.description && (
              <p className="text-sm text-muted-foreground leading-snug">{frame.description}</p>
            )}

            <div className="rounded-md border border-gold/20 bg-gold/5 p-3">
              <div className="text-[10px] uppercase tracking-wider text-gold/80 mb-1">How to unlock</div>
              {achievement ? (
                <>
                  <div className="text-sm font-bold text-foreground">{achievement.name}</div>
                  {achievement.description && (
                    <p className="text-xs text-muted-foreground leading-snug mt-1">{achievement.description}</p>
                  )}
                  {requirements.length > 0 && (
                    <ul className="mt-2 space-y-1" data-testid="frame-detail-requirements">
                      {requirements.map((r) => (
                        <li key={r.key} className="text-xs text-foreground/85 leading-snug">
                          • {formatRequirementLine(r)}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Achievement details unavailable.</p>
              )}
            </div>

            <div className="rounded-md border border-border p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                Artwork sources
              </div>
              {availableSources.length === 0 ? (
                <p className="text-xs text-destructive">No artwork sources available for this frame.</p>
              ) : (
                <ul className="space-y-1" data-testid="frame-detail-sources">
                  {SOURCE_LABELS.map(({ key, label }) => {
                    const url = (frame as any)[key] as string | null;
                    return (
                      <li key={label} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-muted-foreground uppercase tracking-wider text-[10px]">{label}</span>
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-gold hover:underline inline-flex items-center gap-1 truncate max-w-[240px]"
                          >
                            <span className="truncate">{url.split("/").pop()}</span>
                            <ExternalLink size={10} />
                          </a>
                        ) : (
                          <span className="text-muted-foreground/60 text-[11px]">not provided</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="mt-auto">
              {unlocked ? (
                equipped ? (
                  <button
                    onClick={() => onEquip(item, true)}
                    disabled={disabled}
                    className="w-full text-sm font-bold py-2 rounded-md border border-gold/40 text-gold hover:bg-gold/10 disabled:opacity-50"
                  >
                    {busy ? "Working…" : "Unequip"}
                  </button>
                ) : (
                  <button
                    onClick={() => onEquip(item, false)}
                    disabled={disabled}
                    className="w-full text-sm font-bold py-2 rounded-md bg-gradient-gold text-black hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-1"
                  >
                    <Sparkles size={13} /> {busy ? "Working…" : "Equip"}
                  </button>
                )
              ) : (
                <div className="w-full text-sm py-2 rounded-md border border-border text-muted-foreground text-center inline-flex items-center justify-center gap-1">
                  <Lock size={12} /> Locked
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
