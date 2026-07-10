// Wave 4 — Self-view Filter (a.k.a. "Beauty Preview").
//
// Scope in v1: brightness / contrast / smoothing (blur) applied as a CSS
// `filter` to the host's OWN video tile via a scoped <style> tag. It never
// touches the LiveKit publish pipeline, so viewers keep seeing the raw
// camera feed. This is the honest v1 — it helps the host frame themselves
// on-camera but is NOT a broadcast beauty filter.
//
// Wave 4.5 (tracked as a launch blocker before we advertise beauty filters
// publicly) will pipe the treated frames through `canvas.captureStream()`
// and republish the resulting `MediaStreamTrack` through
// `LocalVideoTrack.replaceTrack(...)` so viewers see the same look.
//
// Settings persist in localStorage across battles so the host doesn't have
// to re-dial after every match.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  BeautyFilterSettings, DEFAULT_BEAUTY,
  loadBeautySettings, saveBeautySettings, beautyCssFilter,
} from "@/lib/battleModeration";

interface Props {
  /** Room-scoped selector so multiple sections on a page don't clash. */
  scopeId: string;
  /** Auto-close when the host taps away. */
  onClose?: () => void;
}

/**
 * Applies CSS `filter` to `[data-lk-local-participant] video` under the
 * scoped root. LiveKit's participant tile marks the local participant with
 * `data-lk-local-participant`, so the filter only affects the host's own
 * self-view (matching how consumer camera apps behave).
 */
export default function BeautyFilterPanel({ scopeId, onClose }: Props) {
  const [settings, setSettings] = useState<BeautyFilterSettings>(() => loadBeautySettings());

  useEffect(() => { saveBeautySettings(settings); }, [settings]);

  const cssFilter = useMemo(() => beautyCssFilter(settings), [settings]);
  const selector = `#${cssEscape(scopeId)} [data-lk-local-participant] video`;
  const styleText = `${selector} { filter: ${cssFilter}; transition: filter 120ms ease-out; }`;

  const update = useCallback(<K extends keyof BeautyFilterSettings>(k: K, v: BeautyFilterSettings[K]) => {
    setSettings((s) => ({ ...s, [k]: v }));
  }, []);

  return (
    <>
      {/* Scoped style injection — no global side-effects. */}
      <style data-testid="beauty-filter-style">{styleText}</style>

      <div
        className="rounded-xl border border-border/60 bg-card p-3 space-y-3"
        data-testid="beauty-filter-panel"
        aria-label="Self-view filter"
      >
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-primary" /> Self-view filter
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="beauty-enabled" className="text-xs text-muted-foreground">
              {settings.enabled ? "On" : "Off"}
            </Label>
            <Switch
              id="beauty-enabled"
              checked={settings.enabled}
              onCheckedChange={(v) => update("enabled", v)}
              data-testid="beauty-filter-toggle"
              aria-label="Toggle self-view filter"
            />
          </div>
        </div>

        <Slider
          label="Brightness" min={0.5} max={1.5} step={0.05}
          value={settings.brightness}
          onChange={(v) => update("brightness", v)}
          disabled={!settings.enabled}
          testId="beauty-brightness"
        />
        <Slider
          label="Contrast" min={0.5} max={1.5} step={0.05}
          value={settings.contrast}
          onChange={(v) => update("contrast", v)}
          disabled={!settings.enabled}
          testId="beauty-contrast"
        />
        <Slider
          label="Smoothing" min={0} max={6} step={0.5}
          value={settings.smoothing}
          onChange={(v) => update("smoothing", v)}
          disabled={!settings.enabled}
          testId="beauty-smoothing"
        />

        <div className="flex items-center justify-between pt-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSettings(DEFAULT_BEAUTY)}
            data-testid="beauty-reset"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset
          </Button>
          {onClose && (
            <Button size="sm" variant="outline" onClick={onClose}>Done</Button>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground italic">
          Preview-only in v1. Viewers currently see the raw camera feed.
        </p>
      </div>
    </>
  );
}

function Slider({
  label, min, max, step, value, onChange, disabled, testId,
}: {
  label: string; min: number; max: number; step: number;
  value: number; onChange: (v: number) => void; disabled?: boolean; testId: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <Label htmlFor={testId} className="text-muted-foreground">{label}</Label>
        <span className="tabular-nums text-[11px] text-foreground/70">{value.toFixed(2)}</span>
      </div>
      <input
        id={testId}
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        data-testid={testId}
        aria-label={label}
        className="w-full accent-primary disabled:opacity-40"
      />
    </div>
  );
}

/** Minimal CSS.escape polyfill so we always emit a valid selector. */
function cssEscape(s: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(s);
  return s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}
