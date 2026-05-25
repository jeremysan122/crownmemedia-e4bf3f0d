import { useMemo } from "react";
import { filtersFor, FilterId } from "@/lib/filters";
import FilterOverlay from "@/components/FilterOverlay";

interface Props {
  /** Live preview URL of the user's own media. Falls back to a sample image. */
  previewUrl: string | null;
  mediaType: "image" | "video";
  selected: FilterId;
  onSelect: (id: FilterId) => void;
}

const SAMPLE = "https://images.unsplash.com/photo-1503023345310-bd7c1de61c7d?w=240&q=70";

/**
 * Royal Filter selector — horizontal carousel of mini live previews.
 * • Photo mode  → 20 royal photo filters + Original (cssFilter applied to <img>)
 * • Video mode  → 10 animated royal video filters + Original (overlay class)
 *
 * Active chip gets a gold border + purple glow. Touch-scrollable, keyboard
 * focusable, screen-reader friendly.
 */
export default function FilterPicker({ previewUrl, mediaType, selected, onSelect }: Props) {
  const list = useMemo(
    () => filtersFor(mediaType === "video" ? "video" : "photo"),
    [mediaType],
  );
  const activeLabel = list.find((f) => f.id === selected)?.name ?? "Original";
  const thumb = previewUrl ?? SAMPLE;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">
          Royal Filter
        </span>
        <span className="text-[11px] text-muted-foreground">{activeLabel}</span>
      </div>
      <div
        role="radiogroup"
        aria-label="Royal filter selector"
        className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-2 snap-x"
      >
        {list.map((f) => {
          const active = selected === f.id;
          const isVideo = f.mediaType === "video";
          const overlayClass = "overlayClass" in f ? f.overlayClass : undefined;
          return (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${f.name}${f.premium ? " (premium)" : ""}`}
              onClick={() => onSelect(f.id as FilterId)}
              className="shrink-0 w-16 flex flex-col items-center gap-1 group snap-start focus:outline-none"
            >
              <div
                className={`relative size-16 rounded-xl overflow-hidden border-2 transition is-visible ${
                  active
                    ? "border-primary shadow-[0_0_12px_hsl(var(--accent)/0.55)]"
                    : "border-border group-hover:border-primary/40 group-focus-visible:border-primary/60"
                }`}
              >
                {isVideo && previewUrl ? (
                  <video
                    src={previewUrl}
                    muted
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <img
                    src={thumb}
                    alt=""
                    loading="lazy"
                    className="w-full h-full object-cover"
                    style={{ filter: !isVideo ? f.cssFilter : "none" }}
                  />
                )}
                {overlayClass && (
                  <div
                    aria-hidden="true"
                    className={`pointer-events-none absolute inset-0 ${overlayClass}`}
                  />
                )}
                {f.premium && (
                  <span className="absolute top-0.5 right-0.5 px-1 py-px rounded-full bg-primary/90 text-primary-foreground text-[8px] font-bold">
                    FX
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] font-bold tracking-wide truncate w-full text-center ${
                  active ? "text-gold" : "text-muted-foreground"
                }`}
              >
                {f.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
