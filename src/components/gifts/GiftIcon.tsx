import { CSSProperties, memo, useEffect } from "react";
import { GiftCategory } from "@/types/gifts";

/**
 * GiftIcon — renders a 100% custom SVG illustration for each CrownMe gift.
 * No emojis, no text glyphs, no placeholders. Pure SVG with royal palette:
 * gold metallic, purple gemstones, royal blue shadows, crimson accents.
 *
 * Visual primitives (CrownSvg, CoinSvg, GemSvg, etc.) are composed per
 * animationType to give each of the 100 gifts a distinct identity.
 * Tier controls the surrounding aura and animation intensity.
 */

type Size = "xs" | "sm" | "md" | "lg" | "xl";
const SIZE_PX: Record<Size, number> = { xs: 28, sm: 36, md: 56, lg: 80, xl: 120 };

interface GiftIconProps {
  animationType: string;
  tier: GiftCategory;
  size?: Size;
  animated?: boolean;
  className?: string;
}

/* ──────────────────────────  SHARED <defs>  ────────────────────────── */

const DEFS_ID = "crownme-gift-defs";

/**
 * Ensure the global gradient/filter <defs> sprite exists in document.body.
 * Idempotent and survives any single component's unmount — fixes the bug
 * where SVG gradients (url(#gm-gold) etc.) failed to resolve in production
 * after the original mounting component unmounted, leaving icons rendered
 * as dim/outline-only shapes.
 */
function ensureGiftDefs() {
  if (typeof document === "undefined") return;
  if (document.getElementById(DEFS_ID)) return;
  const tpl = document.createElement("template");
  tpl.innerHTML = GIFT_DEFS_MARKUP;
  const node = tpl.content.firstElementChild;
  if (node) document.body.appendChild(node);
}

function GiftDefs() {
  useEffect(() => {
    ensureGiftDefs();
  }, []);
  return null;
}

// Raw SVG markup mirroring the JSX <defs> below. Kept as a string so it can be
// imperatively re-injected into document.body and never disappear.
const GIFT_DEFS_MARKUP = `
<svg id="${DEFS_ID}" width="0" height="0" style="position:absolute;width:0;height:0" aria-hidden="true">
  <defs>
    <linearGradient id="gm-gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fff3b8"/>
      <stop offset="40%" stop-color="#f5c945"/>
      <stop offset="75%" stop-color="#c8881a"/>
      <stop offset="100%" stop-color="#7a4f0a"/>
    </linearGradient>
    <linearGradient id="gm-gold-bright" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffe27a"/>
      <stop offset="100%" stop-color="#e09a14"/>
    </linearGradient>
    <linearGradient id="gm-purple" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#d6a8ff"/>
      <stop offset="50%" stop-color="#8a3df0"/>
      <stop offset="100%" stop-color="#3d126b"/>
    </linearGradient>
    <linearGradient id="gm-crimson" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ff7a8c"/>
      <stop offset="60%" stop-color="#d11f3a"/>
      <stop offset="100%" stop-color="#5a0814"/>
    </linearGradient>
    <linearGradient id="gm-royalblue" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#7da5ff"/>
      <stop offset="60%" stop-color="#2440c2"/>
      <stop offset="100%" stop-color="#0a1240"/>
    </linearGradient>
    <linearGradient id="gm-emerald" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#9bf2c8"/>
      <stop offset="100%" stop-color="#0d6b3c"/>
    </linearGradient>
    <linearGradient id="gm-diamond" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="50%" stop-color="#cfe9ff"/>
      <stop offset="100%" stop-color="#5b8fd6"/>
    </linearGradient>
    <radialGradient id="gm-mythic" cx="50%" cy="50%" r="60%">
      <stop offset="0%" stop-color="#fff0a8"/>
      <stop offset="40%" stop-color="#f0ad2e"/>
      <stop offset="70%" stop-color="#a134e8"/>
      <stop offset="100%" stop-color="#1a0428"/>
    </radialGradient>
    <radialGradient id="gm-aura-gold" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffd95b" stop-opacity="0.7"/>
      <stop offset="60%" stop-color="#c9851a" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="gm-aura-purple" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#c188ff" stop-opacity="0.65"/>
      <stop offset="60%" stop-color="#5a1aa0" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="gm-aura-crimson" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ff5a78" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <filter id="gm-glow-gold" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2.2" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="gm-glow-strong" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3.5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="gm-glow-mythic" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="4.5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
</svg>`;

// Inject immediately at module load so the very first <GiftIcon> render
// already has access to the gradients (avoids a one-frame outline flash).
ensureGiftDefs();

function _LegacyGiftDefsJSX() {
  return (
    <svg
      id={DEFS_ID}
      width="0"
      height="0"
      style={{ position: "absolute", width: 0, height: 0 }}
      aria-hidden
    >
      <defs>
        <linearGradient id="gm-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff3b8" />
          <stop offset="40%" stopColor="#f5c945" />
          <stop offset="75%" stopColor="#c8881a" />
          <stop offset="100%" stopColor="#7a4f0a" />
        </linearGradient>
        <linearGradient id="gm-gold-bright" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffe27a" />
          <stop offset="100%" stopColor="#e09a14" />
        </linearGradient>
        <linearGradient id="gm-purple" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d6a8ff" />
          <stop offset="50%" stopColor="#8a3df0" />
          <stop offset="100%" stopColor="#3d126b" />
        </linearGradient>
        <linearGradient id="gm-crimson" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff7a8c" />
          <stop offset="60%" stopColor="#d11f3a" />
          <stop offset="100%" stopColor="#5a0814" />
        </linearGradient>
        <linearGradient id="gm-royalblue" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7da5ff" />
          <stop offset="60%" stopColor="#2440c2" />
          <stop offset="100%" stopColor="#0a1240" />
        </linearGradient>
        <linearGradient id="gm-emerald" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9bf2c8" />
          <stop offset="100%" stopColor="#0d6b3c" />
        </linearGradient>
        <linearGradient id="gm-diamond" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="50%" stopColor="#cfe9ff" />
          <stop offset="100%" stopColor="#5b8fd6" />
        </linearGradient>
        <radialGradient id="gm-mythic" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#fff0a8" />
          <stop offset="40%" stopColor="#f0ad2e" />
          <stop offset="70%" stopColor="#a134e8" />
          <stop offset="100%" stopColor="#1a0428" />
        </radialGradient>
        <radialGradient id="gm-aura-gold" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffd95b" stopOpacity="0.7" />
          <stop offset="60%" stopColor="#c9851a" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="gm-aura-purple" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#c188ff" stopOpacity="0.65" />
          <stop offset="60%" stopColor="#5a1aa0" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="gm-aura-crimson" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ff5a78" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>

        {/* Glow filters */}
        <filter id="gm-glow-gold" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="gm-glow-strong" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="gm-glow-mythic" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="4.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  );
}

/* ──────────────────────────  PRIMITIVES  ────────────────────────── */
// All primitives draw inside a 100×100 viewBox. They take optional fill overrides.

const STROKE = "#1a0a05";

const CrownSvg = ({ fill = "url(#gm-gold)", gem = "url(#gm-purple)" }: { fill?: string; gem?: string }) => (
  <g filter="url(#gm-glow-gold)">
    <path
      d="M15 70 L18 36 L34 52 L50 26 L66 52 L82 36 L85 70 Z"
      fill={fill}
      stroke={STROKE}
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <rect x="15" y="68" width="70" height="10" rx="2" fill={fill} stroke={STROKE} strokeWidth="2" />
    <circle cx="50" cy="44" r="5" fill={gem} stroke={STROKE} strokeWidth="1.5" />
    <circle cx="22" cy="62" r="3.2" fill="url(#gm-crimson)" />
    <circle cx="78" cy="62" r="3.2" fill="url(#gm-emerald)" />
    <circle cx="36" cy="62" r="2.4" fill="url(#gm-diamond)" />
    <circle cx="64" cy="62" r="2.4" fill="url(#gm-diamond)" />
    <path d="M18 30 L18 24 M50 20 L50 14 M82 30 L82 24" stroke="url(#gm-gold-bright)" strokeWidth="2" strokeLinecap="round" />
    <circle cx="18" cy="22" r="2.2" fill="url(#gm-gold-bright)" />
    <circle cx="50" cy="12" r="2.6" fill="url(#gm-gold-bright)" />
    <circle cx="82" cy="22" r="2.2" fill="url(#gm-gold-bright)" />
  </g>
);

const CoinSvg = ({ fill = "url(#gm-gold)" }: { fill?: string }) => (
  <g filter="url(#gm-glow-gold)">
    <circle cx="50" cy="50" r="34" fill={fill} stroke={STROKE} strokeWidth="2.5" />
    <circle cx="50" cy="50" r="26" fill="none" stroke="#7a4f0a" strokeWidth="1.2" strokeDasharray="2 2" />
    <path
      d="M40 38 L40 65 L46 65 L46 55 L52 55 L60 65 L67 65 L58 53 C63 51 65 47 65 43 C65 39 62 38 56 38 Z M46 43 L56 43 C58 43 59 44 59 46 C59 49 58 50 55 50 L46 50 Z"
      fill="#3a1d04"
    />
  </g>
);

const GemSvg = ({ fill = "url(#gm-purple)" }: { fill?: string }) => (
  <g filter="url(#gm-glow-strong)">
    <path
      d="M50 14 L78 36 L60 86 L40 86 L22 36 Z"
      fill={fill}
      stroke={STROKE}
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path d="M22 36 L78 36 M50 14 L40 36 L50 86 L60 36 Z" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.2" />
    <path d="M30 30 L40 22" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round" />
  </g>
);

const ScepterSvg = () => (
  <g filter="url(#gm-glow-gold)">
    <rect x="46" y="30" width="8" height="60" rx="2" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="1.5" />
    <circle cx="50" cy="22" r="14" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="2" />
    <circle cx="50" cy="22" r="6" fill="url(#gm-purple)" stroke={STROKE} strokeWidth="1" />
    <path d="M40 12 L60 12" stroke="url(#gm-gold-bright)" strokeWidth="2" />
  </g>
);

const ShieldSvg = ({ fill = "url(#gm-royalblue)" }: { fill?: string }) => (
  <g filter="url(#gm-glow-strong)">
    <path
      d="M50 12 L82 22 L80 56 C80 72 66 84 50 90 C34 84 20 72 20 56 L18 22 Z"
      fill={fill}
      stroke={STROKE}
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    <path d="M50 28 L60 50 L50 70 L40 50 Z" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="1.5" />
  </g>
);

const FlameSvg = ({ fill = "url(#gm-gold)" }: { fill?: string }) => (
  <g filter="url(#gm-glow-strong)">
    <path
      d="M50 10 C58 26 74 32 74 54 C74 74 62 88 50 88 C38 88 26 74 26 54 C26 38 38 36 42 22 C46 30 46 38 50 30 Z"
      fill={fill}
      stroke={STROKE}
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path
      d="M50 40 C56 50 64 56 60 70 C58 78 52 82 50 82 C44 82 40 76 40 68 C40 60 46 56 50 50 Z"
      fill="url(#gm-gold-bright)"
      opacity="0.85"
    />
  </g>
);

const WingsSvg = () => (
  <g filter="url(#gm-glow-gold)">
    <path
      d="M50 50 C30 38 10 42 6 60 C18 56 28 60 32 70 C36 60 46 60 50 70 Z"
      fill="url(#gm-gold)"
      stroke={STROKE}
      strokeWidth="1.8"
    />
    <path
      d="M50 50 C70 38 90 42 94 60 C82 56 72 60 68 70 C64 60 54 60 50 70 Z"
      fill="url(#gm-gold)"
      stroke={STROKE}
      strokeWidth="1.8"
    />
    <circle cx="50" cy="55" r="6" fill="url(#gm-purple)" stroke={STROKE} strokeWidth="1.5" />
  </g>
);

const ThroneSvg = () => (
  <g filter="url(#gm-glow-gold)">
    <rect x="28" y="30" width="44" height="44" fill="url(#gm-purple)" stroke={STROKE} strokeWidth="2" />
    <rect x="22" y="28" width="56" height="14" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="2" />
    <rect x="22" y="70" width="56" height="10" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="2" />
    <rect x="22" y="78" width="10" height="14" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="2" />
    <rect x="68" y="78" width="10" height="14" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="2" />
    <path d="M30 30 L30 18 L50 12 L70 18 L70 30" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="2" strokeLinejoin="round" />
    <circle cx="50" cy="50" r="6" fill="url(#gm-crimson)" stroke={STROKE} strokeWidth="1.2" />
  </g>
);

const CastleSvg = () => (
  <g filter="url(#gm-glow-gold)">
    <rect x="14" y="46" width="72" height="36" fill="url(#gm-royalblue)" stroke={STROKE} strokeWidth="2" />
    <path d="M14 46 L14 36 L22 36 L22 42 L30 42 L30 36 L38 36 L38 42 L62 42 L62 36 L70 36 L70 42 L78 42 L78 36 L86 36 L86 46 Z" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="2" strokeLinejoin="round" />
    <rect x="40" y="58" width="20" height="24" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="1.5" />
    <rect x="44" y="62" width="12" height="20" fill="#1a0a05" />
    <path d="M50 30 L52 36 L48 36 Z" fill="url(#gm-crimson)" />
  </g>
);

const OrbSvg = ({ fill = "url(#gm-purple)" }: { fill?: string }) => (
  <g filter="url(#gm-glow-strong)">
    <circle cx="50" cy="50" r="34" fill={fill} stroke={STROKE} strokeWidth="2" />
    <ellipse cx="40" cy="38" rx="12" ry="6" fill="rgba(255,255,255,0.5)" />
    <circle cx="50" cy="50" r="34" fill="none" stroke="url(#gm-gold)" strokeWidth="2" strokeDasharray="3 4" />
  </g>
);

const DragonSvg = () => (
  <g filter="url(#gm-glow-strong)">
    <path
      d="M20 60 C20 40 40 30 50 30 C70 30 80 44 78 60 C76 76 60 82 50 78 C58 72 60 64 54 60 C48 56 38 60 36 70 C30 70 22 70 20 60 Z"
      fill="url(#gm-emerald)"
      stroke={STROKE}
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <circle cx="64" cy="46" r="3" fill="#fff" />
    <circle cx="64" cy="46" r="1.4" fill="#000" />
    <path d="M70 38 L78 30 M74 42 L84 38" stroke="url(#gm-gold)" strokeWidth="2" strokeLinecap="round" />
  </g>
);

const PortalSvg = () => (
  <g filter="url(#gm-glow-mythic)">
    <ellipse cx="50" cy="50" rx="36" ry="40" fill="url(#gm-mythic)" stroke={STROKE} strokeWidth="2" />
    <ellipse cx="50" cy="50" rx="26" ry="30" fill="none" stroke="url(#gm-gold-bright)" strokeWidth="1.5" />
    <ellipse cx="50" cy="50" rx="14" ry="18" fill="#06010d" />
    <circle cx="50" cy="50" r="3" fill="url(#gm-gold-bright)" />
  </g>
);

const UniverseSvg = () => (
  <g filter="url(#gm-glow-mythic)">
    <circle cx="50" cy="50" r="38" fill="url(#gm-mythic)" stroke={STROKE} strokeWidth="2" />
    <ellipse cx="50" cy="50" rx="38" ry="10" fill="none" stroke="url(#gm-gold-bright)" strokeWidth="2" transform="rotate(-20 50 50)" />
    <circle cx="32" cy="34" r="1.5" fill="#fff" />
    <circle cx="68" cy="40" r="1.2" fill="#fff" />
    <circle cx="58" cy="68" r="1.6" fill="#fff" />
    <circle cx="40" cy="62" r="1" fill="#fff" />
  </g>
);

const RoseSvg = () => (
  <g filter="url(#gm-glow-strong)">
    <circle cx="50" cy="44" r="18" fill="url(#gm-crimson)" stroke={STROKE} strokeWidth="2" />
    <path d="M50 44 C44 38 44 32 50 30 C56 32 56 38 50 44 Z M50 44 C58 42 62 46 60 52 C54 54 50 50 50 44 Z M50 44 C42 42 38 46 40 52 C46 54 50 50 50 44 Z" fill="#fff" opacity="0.35" />
    <path d="M50 60 C42 70 30 78 22 88 M50 60 C58 72 70 78 78 88" stroke="url(#gm-emerald)" strokeWidth="3" fill="none" strokeLinecap="round" />
  </g>
);

const ScrollSvg = () => (
  <g filter="url(#gm-glow-gold)">
    <rect x="22" y="26" width="56" height="48" fill="#f3e0b1" stroke={STROKE} strokeWidth="2" />
    <ellipse cx="22" cy="50" rx="6" ry="24" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="2" />
    <ellipse cx="78" cy="50" rx="6" ry="24" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="2" />
    <path d="M32 40 L68 40 M32 50 L68 50 M32 60 L60 60" stroke="#7a5a1a" strokeWidth="1.5" strokeLinecap="round" />
  </g>
);

const BannerSvg = () => (
  <g filter="url(#gm-glow-strong)">
    <path d="M22 14 L78 14 L78 70 L50 58 L22 70 Z" fill="url(#gm-crimson)" stroke={STROKE} strokeWidth="2" strokeLinejoin="round" />
    <circle cx="50" cy="34" r="10" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="1.5" />
    <path d="M50 28 L52 32 L56 32 L53 35 L54 39 L50 37 L46 39 L47 35 L44 32 L48 32 Z" fill="#3a1d04" />
  </g>
);

const StarSvg = ({ fill = "url(#gm-gold)" }: { fill?: string }) => (
  <g filter="url(#gm-glow-strong)">
    <path
      d="M50 8 L60 38 L92 38 L66 56 L76 88 L50 70 L24 88 L34 56 L8 38 L40 38 Z"
      fill={fill}
      stroke={STROKE}
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </g>
);

const ChestSvg = () => (
  <g filter="url(#gm-glow-gold)">
    <rect x="16" y="44" width="68" height="36" fill="url(#gm-royalblue)" stroke={STROKE} strokeWidth="2" />
    <path d="M16 44 C16 28 30 24 50 24 C70 24 84 28 84 44 Z" fill="url(#gm-royalblue)" stroke={STROKE} strokeWidth="2" />
    <rect x="16" y="54" width="68" height="6" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="1.5" />
    <rect x="44" y="48" width="12" height="16" rx="2" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="1.5" />
    <circle cx="50" cy="56" r="2" fill="#1a0a05" />
    <circle cx="32" cy="74" r="3" fill="url(#gm-gold-bright)" />
    <circle cx="68" cy="76" r="3" fill="url(#gm-gold-bright)" />
  </g>
);

const RibbonSvg = () => (
  <g filter="url(#gm-glow-gold)">
    <path d="M50 20 L62 38 L82 36 L70 52 L80 70 L60 64 L50 82 L40 64 L20 70 L30 52 L18 36 L38 38 Z"
      fill="url(#gm-purple)" stroke={STROKE} strokeWidth="2" strokeLinejoin="round" />
    <circle cx="50" cy="52" r="10" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="1.5" />
  </g>
);

const FeatherSvg = () => (
  <g filter="url(#gm-glow-gold)">
    <path d="M30 80 L70 30 C76 24 82 26 84 30 C86 36 80 50 70 60 L40 80 Z"
      fill="url(#gm-gold)" stroke={STROKE} strokeWidth="2" strokeLinejoin="round" />
    <path d="M40 70 L70 38 M44 76 L74 44" stroke="#7a4f0a" strokeWidth="1.2" />
  </g>
);

const BellSvg = () => (
  <g filter="url(#gm-glow-gold)">
    <path d="M50 20 L48 26 C32 30 28 46 30 64 L26 70 L74 70 L70 64 C72 46 68 30 52 26 L50 20 Z"
      fill="url(#gm-gold)" stroke={STROKE} strokeWidth="2" strokeLinejoin="round" />
    <circle cx="50" cy="78" r="5" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="2" />
  </g>
);

const CupSvg = () => (
  <g filter="url(#gm-glow-gold)">
    <path d="M28 26 L72 26 L70 52 C70 64 60 70 50 70 C40 70 30 64 30 52 Z"
      fill="url(#gm-gold)" stroke={STROKE} strokeWidth="2" strokeLinejoin="round" />
    <rect x="44" y="70" width="12" height="10" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="2" />
    <rect x="32" y="80" width="36" height="6" rx="2" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="2" />
    <ellipse cx="50" cy="30" rx="20" ry="4" fill="url(#gm-crimson)" />
  </g>
);

const KeySvg = () => (
  <g filter="url(#gm-glow-gold)">
    <circle cx="32" cy="50" r="16" fill="none" stroke="url(#gm-gold)" strokeWidth="6" />
    <circle cx="32" cy="50" r="6" fill="url(#gm-purple)" />
    <rect x="46" y="46" width="40" height="8" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="1.5" />
    <rect x="74" y="54" width="6" height="10" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="1.5" />
    <rect x="64" y="54" width="6" height="10" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="1.5" />
  </g>
);

const TrumpetSvg = () => (
  <g filter="url(#gm-glow-gold)">
    <path d="M14 50 L62 38 L62 62 Z" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="2" strokeLinejoin="round" />
    <circle cx="74" cy="50" r="18" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="2" />
    <circle cx="74" cy="50" r="10" fill="#1a0a05" />
  </g>
);

const LaurelSvg = () => (
  <g filter="url(#gm-glow-gold)">
    <path d="M50 14 C28 20 18 40 22 70 C28 80 40 84 50 82 C60 84 72 80 78 70 C82 40 72 20 50 14 Z"
      fill="none" stroke="url(#gm-gold)" strokeWidth="6" strokeLinejoin="round" />
    {Array.from({ length: 6 }).map((_, i) => (
      <ellipse key={`l${i}`} cx={26 + i * 2} cy={28 + i * 8} rx="6" ry="3" fill="url(#gm-emerald)" transform={`rotate(${-50 + i * 5} ${26 + i * 2} ${28 + i * 8})`} />
    ))}
    {Array.from({ length: 6 }).map((_, i) => (
      <ellipse key={`r${i}`} cx={74 - i * 2} cy={28 + i * 8} rx="6" ry="3" fill="url(#gm-emerald)" transform={`rotate(${50 - i * 5} ${74 - i * 2} ${28 + i * 8})`} />
    ))}
  </g>
);

const LionSvg = () => (
  <g filter="url(#gm-glow-gold)">
    {Array.from({ length: 12 }).map((_, i) => {
      const a = (i / 12) * Math.PI * 2;
      const x = 50 + Math.cos(a) * 36;
      const y = 50 + Math.sin(a) * 36;
      return <circle key={i} cx={x} cy={y} r="9" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="1.5" />;
    })}
    <circle cx="50" cy="50" r="22" fill="url(#gm-gold-bright)" stroke={STROKE} strokeWidth="2" />
    <circle cx="42" cy="46" r="2.4" fill="#1a0a05" />
    <circle cx="58" cy="46" r="2.4" fill="#1a0a05" />
    <path d="M44 60 Q50 64 56 60" stroke="#1a0a05" strokeWidth="1.8" fill="none" strokeLinecap="round" />
  </g>
);

const HaloSvg = () => (
  <g filter="url(#gm-glow-strong)">
    <ellipse cx="50" cy="50" rx="38" ry="10" fill="none" stroke="url(#gm-gold-bright)" strokeWidth="6" />
    <ellipse cx="50" cy="50" rx="28" ry="6" fill="none" stroke="url(#gm-gold)" strokeWidth="3" />
  </g>
);

const FireworkSvg = () => (
  <g filter="url(#gm-glow-strong)">
    {Array.from({ length: 12 }).map((_, i) => {
      const a = (i / 12) * Math.PI * 2;
      const x1 = 50 + Math.cos(a) * 12;
      const y1 = 50 + Math.sin(a) * 12;
      const x2 = 50 + Math.cos(a) * 38;
      const y2 = 50 + Math.sin(a) * 38;
      const c = i % 3 === 0 ? "url(#gm-gold-bright)" : i % 3 === 1 ? "url(#gm-purple)" : "url(#gm-crimson)";
      return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={c} strokeWidth="3" strokeLinecap="round" />;
    })}
    <circle cx="50" cy="50" r="6" fill="url(#gm-gold-bright)" />
  </g>
);

const RaysSvg = () => (
  <g filter="url(#gm-glow-strong)">
    {Array.from({ length: 16 }).map((_, i) => {
      const a = (i / 16) * Math.PI * 2;
      const x = 50 + Math.cos(a) * 44;
      const y = 50 + Math.sin(a) * 44;
      return <line key={i} x1="50" y1="50" x2={x} y2={y} stroke="url(#gm-gold-bright)" strokeWidth="2" />;
    })}
    <circle cx="50" cy="50" r="14" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="2" />
  </g>
);

const ArmorSvg = () => (
  <g filter="url(#gm-glow-strong)">
    <path d="M30 26 L70 26 L74 40 L70 80 L50 86 L30 80 L26 40 Z" fill="url(#gm-royalblue)" stroke={STROKE} strokeWidth="2" strokeLinejoin="round" />
    <path d="M50 26 L50 86" stroke="url(#gm-gold)" strokeWidth="3" />
    <circle cx="50" cy="50" r="8" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="1.5" />
  </g>
);

const InfinitySvg = () => (
  <g filter="url(#gm-glow-mythic)">
    <path
      d="M28 50 C28 36 42 36 50 50 C58 64 72 64 72 50 C72 36 58 36 50 50 C42 64 28 64 28 50 Z"
      fill="none"
      stroke="url(#gm-gold-bright)"
      strokeWidth="8"
      strokeLinecap="round"
    />
  </g>
);

const VortexSvg = () => (
  <g filter="url(#gm-glow-mythic)">
    {Array.from({ length: 4 }).map((_, i) => (
      <circle key={i} cx="50" cy="50" r={36 - i * 8} fill="none" stroke="url(#gm-purple)" strokeWidth="3" strokeDasharray={`${20 - i * 4} 6`} />
    ))}
    <circle cx="50" cy="50" r="6" fill="url(#gm-gold-bright)" />
  </g>
);

const PhoenixSvg = () => (
  <g filter="url(#gm-glow-strong)">
    <path d="M50 16 C40 30 24 32 18 50 C30 46 38 50 38 60 C44 54 48 54 50 64 C52 54 56 54 62 60 C62 50 70 46 82 50 C76 32 60 30 50 16 Z"
      fill="url(#gm-crimson)" stroke={STROKE} strokeWidth="2" strokeLinejoin="round" />
    <circle cx="50" cy="40" r="5" fill="url(#gm-gold-bright)" />
  </g>
);

const ChariotSvg = () => (
  <g filter="url(#gm-glow-gold)">
    <rect x="28" y="36" width="44" height="24" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="2" />
    <path d="M28 36 L20 28 M72 36 L80 28" stroke={STROKE} strokeWidth="2" strokeLinecap="round" />
    <circle cx="32" cy="68" r="12" fill="none" stroke="url(#gm-gold)" strokeWidth="4" />
    <circle cx="68" cy="68" r="12" fill="none" stroke="url(#gm-gold)" strokeWidth="4" />
    <circle cx="32" cy="68" r="3" fill="url(#gm-purple)" />
    <circle cx="68" cy="68" r="3" fill="url(#gm-purple)" />
  </g>
);

const PalaceGatesSvg = () => (
  <g filter="url(#gm-glow-gold)">
    <rect x="14" y="20" width="32" height="68" fill="url(#gm-royalblue)" stroke={STROKE} strokeWidth="2" />
    <rect x="54" y="20" width="32" height="68" fill="url(#gm-royalblue)" stroke={STROKE} strokeWidth="2" />
    <path d="M14 20 C14 12 30 8 46 12 L46 20 Z M86 20 C86 12 70 8 54 12 L54 20 Z" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="2" />
    <circle cx="42" cy="50" r="3" fill="url(#gm-gold)" />
    <circle cx="58" cy="50" r="3" fill="url(#gm-gold)" />
  </g>
);

const ShipSvg = () => (
  <g filter="url(#gm-glow-gold)">
    <path d="M14 64 L86 64 L74 84 L26 84 Z" fill="url(#gm-royalblue)" stroke={STROKE} strokeWidth="2" strokeLinejoin="round" />
    <rect x="48" y="14" width="4" height="50" fill="#3a1d04" />
    <path d="M52 18 L80 38 L52 38 Z" fill="url(#gm-crimson)" stroke={STROKE} strokeWidth="1.5" />
    <path d="M48 42 L20 60 L48 60 Z" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="1.5" />
  </g>
);

const EclipseSvg = () => (
  <g filter="url(#gm-glow-mythic)">
    <circle cx="50" cy="50" r="36" fill="url(#gm-gold-bright)" />
    <circle cx="50" cy="50" r="30" fill="#06010d" />
    <circle cx="50" cy="50" r="36" fill="none" stroke="url(#gm-gold-bright)" strokeWidth="2" />
  </g>
);

const CloudSvg = () => (
  <g filter="url(#gm-glow-strong)">
    <path d="M22 60 C14 60 14 46 24 46 C24 36 40 32 46 42 C52 32 70 32 72 46 C84 44 86 60 76 62 Z"
      fill="url(#gm-diamond)" stroke={STROKE} strokeWidth="2" strokeLinejoin="round" />
    {Array.from({ length: 5 }).map((_, i) => (
      <line key={i} x1={28 + i * 12} y1="68" x2={26 + i * 12} y2="84" stroke="url(#gm-gold-bright)" strokeWidth="2" strokeLinecap="round" />
    ))}
  </g>
);

const SunSvg = () => (
  <g filter="url(#gm-glow-strong)">
    {Array.from({ length: 12 }).map((_, i) => {
      const a = (i / 12) * Math.PI * 2;
      const x1 = 50 + Math.cos(a) * 24;
      const y1 = 50 + Math.sin(a) * 24;
      const x2 = 50 + Math.cos(a) * 42;
      const y2 = 50 + Math.sin(a) * 42;
      return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="url(#gm-gold-bright)" strokeWidth="3" strokeLinecap="round" />;
    })}
    <circle cx="50" cy="50" r="20" fill="url(#gm-gold-bright)" stroke={STROKE} strokeWidth="2" />
  </g>
);

const LightningSvg = () => (
  <g filter="url(#gm-glow-mythic)">
    <path d="M52 10 L26 56 L46 56 L36 90 L72 42 L52 42 L60 10 Z" fill="url(#gm-gold-bright)" stroke={STROKE} strokeWidth="2" strokeLinejoin="round" />
  </g>
);

const SnowflakeSvg = () => (
  <g filter="url(#gm-glow-strong)">
    {Array.from({ length: 6 }).map((_, i) => (
      <g key={i} transform={`rotate(${i * 60} 50 50)`}>
        <line x1="50" y1="14" x2="50" y2="86" stroke="url(#gm-diamond)" strokeWidth="3" strokeLinecap="round" />
        <line x1="50" y1="22" x2="44" y2="28" stroke="url(#gm-diamond)" strokeWidth="2" strokeLinecap="round" />
        <line x1="50" y1="22" x2="56" y2="28" stroke="url(#gm-diamond)" strokeWidth="2" strokeLinecap="round" />
      </g>
    ))}
    <circle cx="50" cy="50" r="4" fill="url(#gm-gold-bright)" />
  </g>
);

const PortalGoldSvg = () => (
  <g filter="url(#gm-glow-mythic)">
    <ellipse cx="50" cy="50" rx="38" ry="42" fill="url(#gm-aura-purple)" />
    <ellipse cx="50" cy="50" rx="32" ry="36" fill="none" stroke="url(#gm-gold-bright)" strokeWidth="2" />
    <ellipse cx="50" cy="50" rx="22" ry="26" fill="none" stroke="url(#gm-purple)" strokeWidth="2" />
    <CrownSvg />
  </g>
);

const ChalkSvg = () => (
  <g filter="url(#gm-glow-gold)">
    <rect x="40" y="30" width="20" height="50" rx="3" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="1.5" />
    <circle cx="50" cy="22" r="6" fill="url(#gm-purple)" stroke={STROKE} strokeWidth="1" />
  </g>
);

const SwordSvg = () => (
  <g filter="url(#gm-glow-strong)">
    <path d="M50 12 L56 60 L50 70 L44 60 Z" fill="url(#gm-diamond)" stroke={STROKE} strokeWidth="1.5" />
    <rect x="36" y="60" width="28" height="6" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="1.5" />
    <rect x="46" y="66" width="8" height="20" fill="url(#gm-purple)" stroke={STROKE} strokeWidth="1.5" />
  </g>
);

const PlanetSvg = () => (
  <g filter="url(#gm-glow-mythic)">
    <circle cx="50" cy="50" r="26" fill="url(#gm-royalblue)" stroke={STROKE} strokeWidth="2" />
    <ellipse cx="50" cy="50" rx="42" ry="10" fill="none" stroke="url(#gm-gold-bright)" strokeWidth="3" transform="rotate(-18 50 50)" />
    <ellipse cx="42" cy="44" rx="6" ry="3" fill="url(#gm-emerald)" opacity="0.6" />
  </g>
);

const SparkleClusterSvg = ({ fill = "url(#gm-gold-bright)" }: { fill?: string }) => (
  <g filter="url(#gm-glow-strong)">
    {[
      [50, 30, 14],
      [28, 60, 8],
      [72, 60, 8],
      [50, 78, 6],
    ].map(([x, y, r], i) => (
      <g key={i} transform={`translate(${x} ${y})`}>
        <path d={`M0 ${-r} L${r * 0.3} 0 L0 ${r} L${-r * 0.3} 0 Z M${-r} 0 L0 ${r * 0.3} L${r} 0 L0 ${-r * 0.3} Z`} fill={fill} />
      </g>
    ))}
  </g>
);

/* ──────────────────  EXTRA PRIMITIVES — gift-specific  ────────────────── */

// Two clapping royal hands wearing gold gloves
const ClapHandsSvg = () => (
  <g filter="url(#gm-glow-gold)">
    <path d="M30 30 C26 36 24 50 28 64 C30 72 36 78 44 78 L48 78 L48 30 C48 24 42 22 38 24 C34 22 30 24 30 30 Z"
      fill="url(#gm-gold)" stroke={STROKE} strokeWidth="2" strokeLinejoin="round" />
    <path d="M70 30 C74 36 76 50 72 64 C70 72 64 78 56 78 L52 78 L52 30 C52 24 58 22 62 24 C66 22 70 24 70 30 Z"
      fill="url(#gm-gold)" stroke={STROKE} strokeWidth="2" strokeLinejoin="round" />
    {[14, 22, 30].map((d, i) => (
      <g key={i}>
        <path d={`M22 ${50 - d} L18 ${52 - d}`} stroke="url(#gm-gold-bright)" strokeWidth="2" strokeLinecap="round" />
        <path d={`M78 ${50 - d} L82 ${52 - d}`} stroke="url(#gm-gold-bright)" strokeWidth="2" strokeLinecap="round" />
      </g>
    ))}
  </g>
);

// Royal seal — wax stamp with crown impression
const SealStampSvg = () => (
  <g filter="url(#gm-glow-strong)">
    <circle cx="50" cy="50" r="32" fill="url(#gm-crimson)" stroke={STROKE} strokeWidth="2" />
    <circle cx="50" cy="50" r="24" fill="none" stroke="url(#gm-gold-bright)" strokeWidth="1.5" strokeDasharray="3 3" />
    <path d="M34 56 L36 42 L44 50 L50 36 L56 50 L64 42 L66 56 Z" fill="url(#gm-gold-bright)" stroke={STROKE} strokeWidth="1.2" />
    <path d="M34 56 L66 56 L64 62 L36 62 Z" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="1" />
  </g>
);

// Multi-coin "rain"
const CoinRainSvg = () => (
  <g filter="url(#gm-glow-gold)">
    {[
      [22, 22, 0.55],
      [70, 18, 0.5],
      [44, 34, 0.45],
      [78, 50, 0.6],
      [16, 60, 0.5],
      [50, 64, 0.7],
      [32, 80, 0.55],
      [72, 80, 0.5],
    ].map(([x, y, s], i) => (
      <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
        <circle cx="0" cy="0" r="20" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="2" />
        <circle cx="0" cy="0" r="14" fill="none" stroke="#7a4f0a" strokeWidth="1" strokeDasharray="2 2" />
      </g>
    ))}
  </g>
);

// Multi-crown storm
const CrownStormSvg = () => (
  <g>
    {[
      [22, 22, 0.4],
      [68, 18, 0.45],
      [50, 40, 0.55],
      [16, 60, 0.4],
      [78, 60, 0.4],
      [40, 76, 0.4],
      [70, 80, 0.35],
    ].map(([x, y, s], i) => (
      <g key={i} transform={`translate(${x - 50 * (s as number)} ${y - 50 * (s as number)}) scale(${s})`}>
        <CrownSvg />
      </g>
    ))}
  </g>
);

// Crown descending (coronation) — crown over a pedestal beam
const CrownDescentSvg = () => (
  <g>
    <path d="M50 88 L24 30 L76 30 Z" fill="url(#gm-aura-gold)" />
    <g transform="translate(0 -4)"><CrownSvg /></g>
    <ellipse cx="50" cy="92" rx="22" ry="3" fill="url(#gm-gold)" opacity="0.7" />
  </g>
);

// Crown ascending — crown rising with light streak
const CrownAscendSvg = () => (
  <g>
    <path d="M50 12 L34 80 L66 80 Z" fill="url(#gm-aura-gold)" />
    <g transform="translate(0 6)"><CrownSvg /></g>
    {[0, 1, 2].map((i) => (
      <line key={i} x1={42 + i * 8} y1="86" x2={44 + i * 8} y2="96" stroke="url(#gm-gold-bright)" strokeWidth="2" strokeLinecap="round" />
    ))}
  </g>
);

// Crown + flame trail
const CrownFlameTrailSvg = () => (
  <g>
    <g transform="translate(0 -8) scale(0.85)" style={{ transformOrigin: "50px 50px" }}>
      <CrownSvg />
    </g>
    <g transform="translate(0 18) scale(0.7)" style={{ transformOrigin: "50px 50px" }}>
      <FlameSvg />
    </g>
  </g>
);

// Crown silhouette inside eclipse
const CrownEclipseSvg = () => (
  <g filter="url(#gm-glow-mythic)">
    <circle cx="50" cy="50" r="38" fill="url(#gm-gold-bright)" />
    <circle cx="50" cy="50" r="32" fill="#06010d" />
    <g opacity="0.9" transform="translate(0 4) scale(0.7)" style={{ transformOrigin: "50px 50px" }}>
      <path d="M15 70 L18 36 L34 52 L50 26 L66 52 L82 36 L85 70 Z" fill="#06010d" stroke="url(#gm-gold-bright)" strokeWidth="2" />
      <rect x="15" y="68" width="70" height="10" rx="2" fill="#06010d" stroke="url(#gm-gold-bright)" strokeWidth="2" />
    </g>
  </g>
);

// Crown over castle — kingdom arrival
const KingdomArrivalSvg = () => (
  <g>
    <g transform="translate(0 14) scale(0.95)" style={{ transformOrigin: "50px 50px" }}>
      <CastleSvg />
    </g>
    <g transform="translate(0 -22) scale(0.55)" style={{ transformOrigin: "50px 50px" }}>
      <CrownSvg />
    </g>
  </g>
);

// Two ships with crown sails
const ArmadaSvg = () => (
  <g>
    <g transform="translate(-18 6) scale(0.7)" style={{ transformOrigin: "50px 50px" }}><ShipSvg /></g>
    <g transform="translate(18 -8) scale(0.7)" style={{ transformOrigin: "50px 50px" }}><ShipSvg /></g>
  </g>
);

// Empire city — castle + skyline towers
const EmpireCitySvg = () => (
  <g filter="url(#gm-glow-gold)">
    <rect x="10" y="60" width="80" height="28" fill="url(#gm-royalblue)" stroke={STROKE} strokeWidth="1.5" />
    {[14, 26, 38, 56, 70, 82].map((x, i) => (
      <rect key={i} x={x} y={40 + (i % 2) * 6} width="8" height={28 - (i % 2) * 6} fill="url(#gm-gold)" stroke={STROKE} strokeWidth="1" />
    ))}
    <g transform="translate(0 -16) scale(0.45)" style={{ transformOrigin: "50px 50px" }}>
      <CrownSvg />
    </g>
  </g>
);

// Empire rise — skyline + upward arrow rays
const EmpireRiseSvg = () => (
  <g>
    <EmpireCitySvg />
    {[30, 50, 70].map((x, i) => (
      <path key={i} d={`M${x} 24 L${x - 4} 32 L${x + 4} 32 Z`} fill="url(#gm-gold-bright)" />
    ))}
  </g>
);

// Two crowns merging (kings / queens)
const CrownsMergeSvg = ({ accent = "url(#gm-purple)" }: { accent?: string }) => (
  <g>
    <g transform="translate(-12 4) scale(0.62)" style={{ transformOrigin: "50px 50px" }}>
      <CrownSvg />
    </g>
    <g transform="translate(12 4) scale(0.62)" style={{ transformOrigin: "50px 50px" }}>
      <CrownSvg gem={accent} />
    </g>
    <circle cx="50" cy="50" r="32" fill="none" stroke="url(#gm-gold-bright)" strokeWidth="1" strokeDasharray="2 3" />
  </g>
);

// Dynasty crest — shield + crown
const DynastyCrestSvg = () => (
  <g>
    <ShieldSvg fill="url(#gm-purple)" />
    <g transform="translate(0 -28) scale(0.45)" style={{ transformOrigin: "50px 50px" }}>
      <CrownSvg />
    </g>
  </g>
);

// Heaven clouds + crown
const HeavenCrownSvg = () => (
  <g>
    <CloudSvg />
    <g transform="translate(0 -22) scale(0.5)" style={{ transformOrigin: "50px 50px" }}>
      <CrownSvg />
    </g>
  </g>
);

// Spotlight beam
const SpotlightSvg = () => (
  <g filter="url(#gm-glow-strong)">
    <path d="M50 12 L20 88 L80 88 Z" fill="url(#gm-aura-gold)" />
    <path d="M50 12 L34 88 L66 88 Z" fill="url(#gm-gold-bright)" opacity="0.45" />
    <g transform="translate(0 -6) scale(0.55)" style={{ transformOrigin: "50px 50px" }}>
      <CrownSvg />
    </g>
  </g>
);

// Mirror — queen's mirror with handle
const MirrorSvg = () => (
  <g filter="url(#gm-glow-gold)">
    <ellipse cx="50" cy="40" rx="22" ry="26" fill="url(#gm-diamond)" stroke="url(#gm-gold)" strokeWidth="4" />
    <ellipse cx="44" cy="32" rx="6" ry="3" fill="rgba(255,255,255,0.7)" />
    <rect x="46" y="64" width="8" height="22" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="1.5" />
    <rect x="40" y="84" width="20" height="6" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="1.5" />
  </g>
);

// King's decree scroll — glowing sealed scroll
const DecreeSvg = () => (
  <g filter="url(#gm-glow-strong)">
    <ScrollSvg />
    <circle cx="50" cy="60" r="6" fill="url(#gm-crimson)" stroke={STROKE} strokeWidth="1" />
    <path d="M48 58 L52 58 L51 64 L49 64 Z" fill="url(#gm-gold-bright)" />
  </g>
);

// Queen's blessing — light beam + rose
const BlessingSvg = () => (
  <g>
    <path d="M50 8 L26 92 L74 92 Z" fill="url(#gm-aura-purple)" />
    <g transform="translate(0 6) scale(0.7)" style={{ transformOrigin: "50px 50px" }}>
      <RoseSvg />
    </g>
  </g>
);

// Meteor — fiery star with trail
const MeteorSvg = () => (
  <g filter="url(#gm-glow-strong)">
    <path d="M14 86 L70 30" stroke="url(#gm-crimson)" strokeWidth="6" strokeLinecap="round" opacity="0.6" />
    <path d="M22 80 L66 36" stroke="url(#gm-gold-bright)" strokeWidth="3" strokeLinecap="round" />
    <g transform="translate(20 -20)">
      <StarSvg fill="url(#gm-crimson)" />
    </g>
  </g>
);

// Jewel storm — multiple gems swirling
const JewelStormSvg = () => (
  <g>
    {[
      [30, 30, 0.4, "url(#gm-purple)"],
      [70, 28, 0.35, "url(#gm-emerald)"],
      [22, 60, 0.4, "url(#gm-crimson)"],
      [76, 64, 0.35, "url(#gm-diamond)"],
      [50, 50, 0.5, "url(#gm-gold-bright)"],
    ].map(([x, y, s, f], i) => (
      <g key={i} transform={`translate(${(x as number) - 50 * (s as number)} ${(y as number) - 50 * (s as number)}) scale(${s})`}>
        <GemSvg fill={f as string} />
      </g>
    ))}
  </g>
);

// Sword flash — crown steal attempt (red flashing)
const CrownStealSvg = () => (
  <g filter="url(#gm-glow-strong)">
    <circle cx="50" cy="50" r="44" fill="url(#gm-aura-crimson)" />
    <g transform="translate(-10 0) scale(0.7)" style={{ transformOrigin: "50px 50px" }}>
      <CrownSvg />
    </g>
    <g transform="translate(14 4) rotate(20 50 50) scale(0.85)" style={{ transformOrigin: "50px 50px" }}>
      <SwordSvg />
    </g>
  </g>
);

// Scepter striking ground — sparks
const ScepterStrikeSvg = () => (
  <g>
    <ScepterSvg />
    {[36, 50, 64].map((x, i) => (
      <line key={i} x1={x} y1="86" x2={x + (i - 1) * 6} y2={94} stroke="url(#gm-gold-bright)" strokeWidth="2" strokeLinecap="round" />
    ))}
    <ellipse cx="50" cy="90" rx="22" ry="3" fill="url(#gm-aura-gold)" />
  </g>
);

// Phoenix wings spread — crimson + gold
const PhoenixWingsSvg = () => (
  <g filter="url(#gm-glow-strong)">
    <path d="M50 50 C28 36 8 42 4 60 C18 56 28 60 32 70 C36 60 46 60 50 70 Z" fill="url(#gm-crimson)" stroke={STROKE} strokeWidth="1.8" />
    <path d="M50 50 C72 36 92 42 96 60 C82 56 72 60 68 70 C64 60 54 60 50 70 Z" fill="url(#gm-crimson)" stroke={STROKE} strokeWidth="1.8" />
    <g transform="translate(0 -4) scale(0.55)" style={{ transformOrigin: "50px 50px" }}>
      <FlameSvg />
    </g>
  </g>
);

// Imperial flame core — concentric flames
const ImperialFlameSvg = () => (
  <g filter="url(#gm-glow-strong)">
    <FlameSvg fill="url(#gm-crimson)" />
    <g transform="translate(0 6) scale(0.6)" style={{ transformOrigin: "50px 50px" }}>
      <FlameSvg fill="url(#gm-gold-bright)" />
    </g>
  </g>
);

// Royal command — diamond + crown insignia
const RoyalCommandSvg = () => (
  <g filter="url(#gm-glow-strong)">
    <path d="M50 12 L82 50 L50 88 L18 50 Z" fill="url(#gm-diamond)" stroke={STROKE} strokeWidth="2" />
    <g transform="translate(0 -2) scale(0.55)" style={{ transformOrigin: "50px 50px" }}>
      <CrownSvg />
    </g>
  </g>
);

// Eternal palace gold — palace gates aglow
const EternalPalaceSvg = () => (
  <g>
    <PalaceGatesSvg />
    <g transform="translate(0 -28) scale(0.5)" style={{ transformOrigin: "50px 50px" }}>
      <CrownSvg />
    </g>
  </g>
);

// Sunburst with crown
const SunburstCrownSvg = () => (
  <g>
    <SunSvg />
    <g transform="translate(0 -2) scale(0.45)" style={{ transformOrigin: "50px 50px" }}>
      <CrownSvg />
    </g>
  </g>
);

// Throne with infinite ring
const ThroneInfiniteSvg = () => (
  <g>
    <g transform="translate(0 6) scale(0.85)" style={{ transformOrigin: "50px 50px" }}>
      <ThroneSvg />
    </g>
    <g transform="translate(0 -28) scale(0.45)" style={{ transformOrigin: "50px 50px" }}>
      <InfinitySvg />
    </g>
  </g>
);

// Divine throne descending light
const DivineThroneSvg = () => (
  <g>
    <path d="M50 6 L26 92 L74 92 Z" fill="url(#gm-aura-gold)" />
    <g transform="translate(0 8) scale(0.85)" style={{ transformOrigin: "50px 50px" }}>
      <ThroneSvg />
    </g>
  </g>
);

// God form — radiant crown
const GodformSvg = () => (
  <g>
    <RaysSvg />
    <g transform="translate(0 0) scale(0.5)" style={{ transformOrigin: "50px 50px" }}>
      <CrownSvg fill="url(#gm-gold-bright)" gem="url(#gm-mythic)" />
    </g>
  </g>
);

// Planet with crown orbit
const PlanetCrownSvg = () => (
  <g>
    <PlanetSvg />
    <g transform="translate(0 -22) scale(0.4) rotate(-18)" style={{ transformOrigin: "50px 50px" }}>
      <CrownSvg />
    </g>
  </g>
);

// Celestial dynasty stars orbit
const CelestialDynastySvg = () => (
  <g filter="url(#gm-glow-mythic)">
    <ellipse cx="50" cy="50" rx="42" ry="14" fill="none" stroke="url(#gm-gold-bright)" strokeWidth="2" transform="rotate(-20 50 50)" />
    <ellipse cx="50" cy="50" rx="42" ry="14" fill="none" stroke="url(#gm-purple)" strokeWidth="2" transform="rotate(28 50 50)" />
    {[
      [20, 38], [80, 60], [50, 18], [62, 78], [38, 78], [86, 40], [16, 60],
    ].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i === 2 ? 3 : 1.6} fill="url(#gm-gold-bright)" />)}
    <g transform="translate(0 -2) scale(0.42)" style={{ transformOrigin: "50px 50px" }}>
      <CrownSvg />
    </g>
  </g>
);

// Ouroboros — dragon biting tail forming a crown ring
const OuroborosSvg = () => (
  <g filter="url(#gm-glow-mythic)">
    <circle cx="50" cy="50" r="34" fill="none" stroke="url(#gm-emerald)" strokeWidth="10" />
    <circle cx="50" cy="50" r="34" fill="none" stroke="url(#gm-gold-bright)" strokeWidth="2" strokeDasharray="3 5" />
    <circle cx="84" cy="50" r="6" fill="url(#gm-emerald)" stroke={STROKE} strokeWidth="1.5" />
    <circle cx="86" cy="48" r="1.4" fill="#fff" />
    <g transform="translate(0 0) scale(0.34)" style={{ transformOrigin: "50px 50px" }}>
      <CrownSvg />
    </g>
  </g>
);

// Immortal throne — throne in fire aura
const ImmortalThroneSvg = () => (
  <g>
    <circle cx="50" cy="56" r="40" fill="url(#gm-aura-crimson)" />
    <g transform="translate(0 0) scale(0.85)" style={{ transformOrigin: "50px 50px" }}>
      <ThroneSvg />
    </g>
    <g transform="translate(-26 18) scale(0.35)" style={{ transformOrigin: "50px 50px" }}><FlameSvg fill="url(#gm-crimson)" /></g>
    <g transform="translate(26 18) scale(0.35)" style={{ transformOrigin: "50px 50px" }}><FlameSvg fill="url(#gm-crimson)" /></g>
  </g>
);

// Crown of creation — explosion forming crown
const CreationSvg = () => (
  <g filter="url(#gm-glow-mythic)">
    {Array.from({ length: 18 }).map((_, i) => {
      const a = (i / 18) * Math.PI * 2;
      const x1 = 50 + Math.cos(a) * 18;
      const y1 = 50 + Math.sin(a) * 18;
      const x2 = 50 + Math.cos(a) * 46;
      const y2 = 50 + Math.sin(a) * 46;
      return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="url(#gm-gold-bright)" strokeWidth="2" strokeLinecap="round" />;
    })}
    <g transform="translate(0 0) scale(0.55)" style={{ transformOrigin: "50px 50px" }}>
      <CrownSvg fill="url(#gm-gold-bright)" gem="url(#gm-mythic)" />
    </g>
  </g>
);

// God emperor crown — crown crackling with lightning
const GodEmperorSvg = () => (
  <g filter="url(#gm-glow-mythic)">
    <circle cx="50" cy="50" r="46" fill="url(#gm-mythic)" opacity="0.5" />
    <g transform="translate(-30 -10) scale(0.45)" style={{ transformOrigin: "50px 50px" }}>
      <LightningSvg />
    </g>
    <g transform="translate(30 -10) scale(0.45)" style={{ transformOrigin: "50px 50px" }}>
      <LightningSvg />
    </g>
    <g transform="translate(0 6) scale(0.85)" style={{ transformOrigin: "50px 50px" }}>
      <CrownSvg fill="url(#gm-gold-bright)" gem="url(#gm-mythic)" />
    </g>
  </g>
);

// Crown beacon — crown atop a beam
const CrownBeaconSvg = () => (
  <g>
    <path d="M50 90 L40 30 L60 30 Z" fill="url(#gm-aura-gold)" />
    <g transform="translate(0 -8) scale(0.7)" style={{ transformOrigin: "50px 50px" }}>
      <CrownSvg />
    </g>
  </g>
);

// Throne spark — throne with sparks
const ThroneSparkSvg = () => (
  <g>
    <ThroneSvg />
    {[20, 50, 80].map((x, i) => (
      <g key={i} transform={`translate(${x - 50} ${-20 + i * 4})`}>
        <SparkleClusterSvg />
      </g>
    ))}
  </g>
);

// Halo crown — halo with crown beneath
const HaloCrownSvg = () => (
  <g>
    <g transform="translate(0 -22)"><HaloSvg /></g>
    <g transform="translate(0 14) scale(0.7)" style={{ transformOrigin: "50px 50px" }}>
      <CrownSvg />
    </g>
  </g>
);

// Gem crown flash — crown with gem sparkle ring
const GemCrownFlashSvg = () => (
  <g>
    <g transform="scale(0.95)" style={{ transformOrigin: "50px 50px" }}>
      <CrownSvg gem="url(#gm-diamond)" />
    </g>
    {[20, 50, 80].map((x, i) => (
      <circle key={i} cx={x} cy={20 + i * 4} r="2.4" fill="url(#gm-diamond)" />
    ))}
  </g>
);

// Regal starfall — multiple stars descending
const StarfallSvg = () => (
  <g>
    {[
      [22, 24, 0.3],
      [70, 30, 0.32],
      [44, 50, 0.34],
      [78, 60, 0.28],
      [30, 72, 0.3],
    ].map(([x, y, s], i) => (
      <g key={i} transform={`translate(${(x as number) - 50 * (s as number)} ${(y as number) - 50 * (s as number)}) scale(${s})`}>
        <StarSvg />
      </g>
    ))}
  </g>
);

// Crown burst — crown surrounded by firework
const CrownBurstSvg = () => (
  <g>
    <FireworkSvg />
    <g transform="scale(0.5)" style={{ transformOrigin: "50px 50px" }}>
      <CrownSvg />
    </g>
  </g>
);

// Crown pulse — crown with rings
const CrownPulseSvg = () => (
  <g>
    <circle cx="50" cy="50" r="42" fill="none" stroke="url(#gm-gold-bright)" strokeWidth="1.5" opacity="0.5" />
    <circle cx="50" cy="50" r="34" fill="none" stroke="url(#gm-gold-bright)" strokeWidth="1.5" opacity="0.7" />
    <g transform="scale(0.75)" style={{ transformOrigin: "50px 50px" }}>
      <CrownSvg />
    </g>
  </g>
);

// King's cup glowing
const KingsCupSvg = () => (
  <g>
    <circle cx="50" cy="50" r="42" fill="url(#gm-aura-gold)" />
    <CupSvg />
  </g>
);

// Crown spark — crown with sparkle accent
const CrownSparkSvg = () => (
  <g>
    <g transform="scale(0.85)" style={{ transformOrigin: "50px 50px" }}><CrownSvg /></g>
    <g transform="translate(28 -28) scale(0.35)"><SparkleClusterSvg /></g>
  </g>
);

// Mini gem droplet
const JewelDropSvg = () => (
  <g filter="url(#gm-glow-strong)">
    <path d="M50 14 C68 38 72 58 50 86 C28 58 32 38 50 14 Z" fill="url(#gm-purple)" stroke={STROKE} strokeWidth="2" strokeLinejoin="round" />
    <path d="M44 30 C40 40 40 52 44 60" stroke="rgba(255,255,255,0.7)" strokeWidth="2" fill="none" strokeLinecap="round" />
  </g>
);

// Velvet ribbon — flowing ribbon strip
const VelvetRibbonSvg = () => (
  <g filter="url(#gm-glow-strong)">
    <path d="M14 56 C26 36 40 76 50 56 C60 36 74 76 86 56 L86 70 C74 90 60 50 50 70 C40 50 26 90 14 70 Z"
      fill="url(#gm-crimson)" stroke="url(#gm-gold-bright)" strokeWidth="2" strokeLinejoin="round" />
  </g>
);

// Royal token — coin with crown engraving
const RoyalTokenSvg = () => (
  <g>
    <CoinSvg />
    <g transform="translate(0 -2) scale(0.32)" style={{ transformOrigin: "50px 50px" }}>
      <CrownSvg />
    </g>
  </g>
);

// Mini crown pin — small crown with pin
const MiniCrownPinSvg = () => (
  <g>
    <g transform="translate(0 -6) scale(0.7)" style={{ transformOrigin: "50px 50px" }}>
      <CrownSvg />
    </g>
    <rect x="48" y="62" width="4" height="22" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="1" />
    <circle cx="50" cy="86" r="3" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="1" />
  </g>
);

// Gold dust — fine particles
const GoldDustSvg = () => (
  <g filter="url(#gm-glow-gold)">
    {Array.from({ length: 22 }).map((_, i) => {
      const x = 12 + (i * 13) % 76;
      const y = 16 + ((i * 19) % 70);
      return <circle key={i} cx={x} cy={y} r={1 + ((i * 7) % 3)} fill="url(#gm-gold-bright)" opacity={0.6 + ((i % 4) * 0.1)} />;
    })}
  </g>
);

// Noble flame — small flame with aura
const NobleFlameSvg = () => (
  <g>
    <circle cx="50" cy="56" r="36" fill="url(#gm-aura-gold)" />
    <g transform="scale(0.85)" style={{ transformOrigin: "50px 50px" }}>
      <FlameSvg />
    </g>
  </g>
);

/* ──────────────────────  FLOWER GIFTS  ────────────────────── */

const Stem = ({ d = "M50 60 C46 74 50 84 50 92 M50 78 C44 76 38 74 34 70 M50 82 C56 80 62 78 66 74" }: { d?: string }) => (
  <path d={d} stroke="url(#gm-emerald)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
);

const PetalRing = ({ count, rx, ry, fill, cx = 50, cy = 42 }: { count: number; rx: number; ry: number; fill: string; cx?: number; cy?: number }) =>
  <>
    {Array.from({ length: count }).map((_, i) => {
      const a = (i / count) * 360;
      return (
        <ellipse key={i} cx={cx} cy={cy - ry * 0.7} rx={rx} ry={ry} fill={fill} stroke={STROKE} strokeWidth="1.2"
          transform={`rotate(${a} ${cx} ${cy})`} />
      );
    })}
  </>;

const DaisySvg = () => (
  <g filter="url(#gm-glow-gold)">
    <Stem />
    <PetalRing count={10} rx={5} ry={10} fill="#fdfdfd" />
    <circle cx="50" cy="42" r="6" fill="url(#gm-gold-bright)" stroke={STROKE} strokeWidth="1.2" />
    <circle cx="48" cy="40" r="1.6" fill="#fff7c2" />
  </g>
);

const LilySvg = () => (
  <g filter="url(#gm-glow-gold)">
    <Stem />
    <PetalRing count={6} rx={6.5} ry={14} fill="#fbf7ee" />
    <circle cx="50" cy="42" r="3" fill="url(#gm-gold)" />
    {[-8, 0, 8].map((dx, i) => (
      <g key={i}>
        <line x1={50 + dx} y1="42" x2={50 + dx * 1.4} y2={34 - Math.abs(dx) * 0.2} stroke="url(#gm-gold)" strokeWidth="1.2" />
        <circle cx={50 + dx * 1.4} cy={34 - Math.abs(dx) * 0.2} r="1.8" fill="url(#gm-gold-bright)" />
      </g>
    ))}
  </g>
);

const TulipSvg = () => (
  <g filter="url(#gm-glow-gold)">
    <path d="M50 60 L50 92" stroke="url(#gm-emerald)" strokeWidth="3" strokeLinecap="round" />
    <path d="M36 70 C30 64 28 56 34 50 C38 60 44 64 50 64 C56 64 62 60 66 50 C72 56 70 64 64 70 Z"
      fill="url(#gm-emerald)" stroke={STROKE} strokeWidth="1.2" opacity="0.85" />
    <path d="M34 50 C34 30 42 22 50 22 C58 22 66 30 66 50 C60 54 56 56 50 56 C44 56 40 54 34 50 Z"
      fill="url(#gm-crimson)" stroke={STROKE} strokeWidth="2" strokeLinejoin="round" />
    <path d="M44 28 C42 38 42 48 44 54" stroke="url(#gm-gold-bright)" strokeWidth="1.2" fill="none" opacity="0.85" />
    <path d="M56 28 C58 38 58 48 56 54" stroke="url(#gm-gold-bright)" strokeWidth="1.2" fill="none" opacity="0.85" />
  </g>
);

const MiniRoseSvg = () => (
  <g filter="url(#gm-glow-gold)">
    <path d="M50 56 C44 70 38 80 30 88 M50 56 C56 70 62 80 70 88" stroke="url(#gm-emerald)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    <circle cx="50" cy="46" r="14" fill="url(#gm-crimson)" stroke={STROKE} strokeWidth="2" />
    <path d="M50 46 C44 42 44 36 50 34 C56 36 56 42 50 46 Z" fill="#7a0a1c" />
    <path d="M50 46 C58 44 60 50 56 54 C50 54 48 50 50 46 Z" fill="#a8132e" />
    <circle cx="55" cy="40" r="1.6" fill="url(#gm-gold-bright)" />
  </g>
);

const SunflowerSvg = () => (
  <g filter="url(#gm-glow-gold)">
    <Stem d="M50 60 C50 76 50 84 50 92" />
    <PetalRing count={14} rx={5} ry={12} fill="url(#gm-gold)" />
    <circle cx="50" cy="42" r="10" fill="#3a1d04" stroke={STROKE} strokeWidth="1.5" />
    <circle cx="50" cy="42" r="6" fill="#2a1402" />
    {[[46,40],[52,44],[48,46],[54,40]].map(([x,y],i)=>(<circle key={i} cx={x} cy={y} r="0.8" fill="url(#gm-gold-bright)"/>))}
  </g>
);

const OrchidSvg = () => (
  <g filter="url(#gm-glow-strong)">
    <Stem d="M50 60 C50 76 50 84 50 92" />
    <PetalRing count={5} rx={8} ry={12} fill="url(#gm-purple)" />
    <ellipse cx="50" cy="48" rx="6" ry="8" fill="#3d126b" stroke="url(#gm-gold-bright)" strokeWidth="1.2" />
    <circle cx="50" cy="48" r="2" fill="url(#gm-gold-bright)" />
  </g>
);

const JasmineSvg = () => (
  <g filter="url(#gm-glow-gold)">
    <Stem d="M50 60 C46 76 50 84 50 92" />
    {[[36,38,0.7],[64,38,0.7],[50,28,0.85],[44,52,0.6],[58,52,0.6]].map(([cx,cy,s],i)=>(
      <g key={i} transform={`translate(${(cx as number)-50} ${(cy as number)-42}) scale(${s})`} style={{transformOrigin:"50px 42px"}}>
        <PetalRing count={5} rx={4} ry={7} fill="#fbf7ee" cx={50} cy={42} />
        <circle cx="50" cy="42" r="2" fill="url(#gm-gold-bright)" />
      </g>
    ))}
  </g>
);

const VioletSvg = () => (
  <g filter="url(#gm-glow-strong)">
    <Stem d="M50 56 C46 74 50 84 50 92" />
    <PetalRing count={5} rx={7} ry={9} fill="url(#gm-purple)" />
    <circle cx="50" cy="42" r="3" fill="url(#gm-gold-bright)" stroke={STROKE} strokeWidth="1" />
    <path d="M50 42 L50 38 M48 41 L46 38 M52 41 L54 38" stroke="#3a1d04" strokeWidth="0.8" />
  </g>
);

const PeonySvg = () => (
  <g filter="url(#gm-glow-strong)">
    <Stem d="M50 64 C50 78 50 84 50 92" />
    <PetalRing count={8} rx={9} ry={12} fill="#f8c8d8" />
    <PetalRing count={8} rx={6} ry={9} fill="#e88aab" />
    <PetalRing count={6} rx={4} ry={6} fill="#c45c7c" />
    <circle cx="50" cy="42" r="3" fill="url(#gm-gold-bright)" />
  </g>
);

const BouquetSvg = () => (
  <g filter="url(#gm-glow-gold)">
    <path d="M40 60 L34 88 M60 60 L66 88 M50 60 L50 88" stroke="url(#gm-emerald)" strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="38" cy="42" r="10" fill="url(#gm-crimson)" stroke={STROKE} strokeWidth="1.5" />
    <circle cx="62" cy="42" r="10" fill="url(#gm-purple)" stroke={STROKE} strokeWidth="1.5" />
    <circle cx="50" cy="32" r="10" fill="#f8c8d8" stroke={STROKE} strokeWidth="1.5" />
    <circle cx="38" cy="42" r="3" fill="#fff" opacity="0.4" />
    <circle cx="62" cy="42" r="3" fill="#fff" opacity="0.4" />
    <rect x="30" y="64" width="40" height="14" rx="3" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="1.5" />
    <path d="M30 71 L20 76 L24 64 Z M70 71 L80 76 L76 64 Z" fill="url(#gm-gold-bright)" stroke={STROKE} strokeWidth="1.2" />
  </g>
);

/* ──────────────────────  OIL BOTTLE GIFTS  ────────────────────── */

const OilBottle = ({ liquid, accent, accentNode }: { liquid: string; accent?: string; accentNode?: JSX.Element }) => (
  <g filter="url(#gm-glow-gold)">
    {/* aura */}
    <circle cx="50" cy="56" r="38" fill="url(#gm-aura-gold)" />
    {/* cap */}
    <rect x="42" y="14" width="16" height="8" rx="1.5" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="1.5" />
    <rect x="40" y="20" width="20" height="6" rx="1.5" fill="url(#gm-gold-bright)" stroke={STROKE} strokeWidth="1.5" />
    {/* neck */}
    <rect x="44" y="26" width="12" height="8" fill="#e8e8f0" stroke={STROKE} strokeWidth="1.2" opacity="0.7" />
    {/* body */}
    <path d="M34 36 C34 32 38 30 44 30 L56 30 C62 30 66 32 66 36 L66 84 C66 88 62 90 56 90 L44 90 C38 90 34 88 34 84 Z"
      fill={liquid} stroke={STROKE} strokeWidth="2" strokeLinejoin="round" />
    {/* glass shine */}
    <path d="M40 40 C38 50 38 70 40 80" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    <path d="M60 44 C61 54 61 64 60 72" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    {/* label band */}
    <rect x="34" y="58" width="32" height="10" fill="url(#gm-gold)" stroke={STROKE} strokeWidth="1" opacity="0.95" />
    <rect x="36" y="60" width="28" height="6" fill="none" stroke={STROKE} strokeWidth="0.6" opacity="0.5" />
    {accent && <circle cx="50" cy="63" r="2.5" fill={accent} stroke={STROKE} strokeWidth="0.6" />}
    {accentNode}
  </g>
);

const LavenderOilSvg = () => (
  <g>
    <OilBottle liquid="#b9a3e6" />
    <g transform="translate(-26 -34) scale(0.42)">
      <path d="M50 30 L50 70" stroke="url(#gm-emerald)" strokeWidth="3" strokeLinecap="round" />
      {[34,40,46,52,58].map((y,i)=>(<circle key={i} cx="50" cy={y} r="3.5" fill="url(#gm-purple)" />))}
    </g>
  </g>
);

const RoseOilSvg = () => (
  <g>
    <OilBottle liquid="#c41a3a" />
    <g transform="translate(20 -28) scale(0.32)"><RoseSvg /></g>
  </g>
);

const MintOilSvg = () => (
  <g>
    <OilBottle liquid="#7dd3a0" />
    <g transform="translate(20 -30) scale(0.4)">
      <path d="M50 80 C50 60 60 50 80 50 C80 70 70 80 50 80 Z" fill="url(#gm-emerald)" stroke={STROKE} strokeWidth="2" />
      <path d="M50 80 C60 70 70 60 80 50" stroke="#0d3a1f" strokeWidth="1.5" fill="none" />
    </g>
  </g>
);

const EucalyptusOilSvg = () => (
  <g>
    <OilBottle liquid="#cfe4c8" />
    <g transform="translate(-24 -32) scale(0.4)">
      <path d="M50 20 L50 80" stroke="#5a7050" strokeWidth="2" />
      {[28,40,52,64].map((y,i)=>(
        <g key={i}>
          <ellipse cx={42} cy={y} rx="6" ry="4" fill="url(#gm-emerald)" stroke={STROKE} strokeWidth="1" opacity="0.85" />
          <ellipse cx={58} cy={y+4} rx="6" ry="4" fill="url(#gm-emerald)" stroke={STROKE} strokeWidth="1" opacity="0.85" />
        </g>
      ))}
    </g>
  </g>
);

const JasmineOilSvg = () => (
  <g>
    <OilBottle liquid="#fdfaee" />
    <g transform="translate(22 -30) scale(0.5)">
      <PetalRing count={5} rx={4} ry={7} fill="#fbf7ee" cx={50} cy={42} />
      <circle cx="50" cy="42" r="2" fill="url(#gm-gold-bright)" />
    </g>
  </g>
);

const SandalwoodOilSvg = () => (
  <g>
    <OilBottle liquid="#8b5a2b" />
    <g transform="translate(20 -28) scale(0.4)">
      <rect x="30" y="40" width="40" height="20" rx="3" fill="#6b3a1a" stroke={STROKE} strokeWidth="1.5" />
      {[44,50,56].map((y,i)=>(<path key={i} d={`M32 ${y} Q50 ${y-2} 68 ${y}`} stroke="#3a1d04" strokeWidth="1" fill="none" opacity="0.7"/>))}
    </g>
  </g>
);

const AmberOilSvg = () => (
  <g>
    <OilBottle liquid="#d68a1c" />
    <circle cx="50" cy="56" r="20" fill="url(#gm-aura-gold)" opacity="0.6" />
    <circle cx="50" cy="50" r="3" fill="url(#gm-gold-bright)" opacity="0.9" />
    <circle cx="44" cy="68" r="2" fill="url(#gm-gold-bright)" opacity="0.7" />
    <circle cx="58" cy="74" r="2.4" fill="url(#gm-gold-bright)" opacity="0.7" />
  </g>
);

const FrankincenseOilSvg = () => (
  <g>
    <OilBottle liquid="#e2b656" />
    {/* incense smoke */}
    <path d="M50 14 C46 8 54 4 50 0" stroke="url(#gm-aura-gold)" strokeWidth="3" fill="none" opacity="0.5" />
    {/* resin drops on label */}
    <circle cx="44" cy="63" r="1.6" fill="url(#gm-gold-bright)" />
    <circle cx="50" cy="63" r="1.8" fill="url(#gm-gold-bright)" />
    <circle cx="56" cy="63" r="1.6" fill="url(#gm-gold-bright)" />
  </g>
);

const MyrrhOilSvg = () => (
  <g>
    <OilBottle liquid="#5a2818" />
    <g transform="translate(22 -28) scale(0.45)">
      <circle cx="50" cy="50" r="10" fill="#6b3a1a" stroke={STROKE} strokeWidth="1.5" />
      <circle cx="46" cy="46" r="3" fill="url(#gm-gold-bright)" opacity="0.7" />
    </g>
  </g>
);

const AnointingOilSvg = () => (
  <g filter="url(#gm-glow-strong)">
    <circle cx="50" cy="56" r="42" fill="url(#gm-aura-gold)" />
    {/* sacred flask */}
    <path d="M42 14 L58 14 L58 22 L62 28 L62 84 C62 88 58 90 50 90 C42 90 38 88 38 84 L38 28 L42 22 Z"
      fill="url(#gm-gold)" stroke={STROKE} strokeWidth="2" strokeLinejoin="round" />
    <path d="M40 38 C40 50 40 70 42 80" stroke="rgba(255,255,255,0.65)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    {/* cross emblem */}
    <path d="M50 50 L50 70 M44 60 L56 60" stroke="#3a1d04" strokeWidth="2.5" strokeLinecap="round" />
    {/* sacred drops */}
    <circle cx="50" cy="10" r="2" fill="url(#gm-gold-bright)" />
    <circle cx="44" cy="6" r="1.2" fill="url(#gm-gold-bright)" opacity="0.7" />
    <circle cx="56" cy="6" r="1.2" fill="url(#gm-gold-bright)" opacity="0.7" />
  </g>
);

/* ──────────────────────  REGISTRY  ────────────────────── */

type IconBuilder = () => JSX.Element;

const ICON: Record<string, IconBuilder> = {
  // ───── FLOWERS (low) ─────
  flower_daisy: () => <DaisySvg />,
  flower_lily: () => <LilySvg />,
  flower_tulip: () => <TulipSvg />,
  flower_rose_mini: () => <MiniRoseSvg />,
  flower_sunflower: () => <SunflowerSvg />,
  flower_orchid: () => <OrchidSvg />,
  flower_jasmine: () => <JasmineSvg />,
  flower_violet: () => <VioletSvg />,
  flower_peony: () => <PeonySvg />,
  flower_bouquet: () => <BouquetSvg />,

  // ───── OILS (low) ─────
  oil_lavender: () => <LavenderOilSvg />,
  oil_rose: () => <RoseOilSvg />,
  oil_mint: () => <MintOilSvg />,
  oil_eucalyptus: () => <EucalyptusOilSvg />,
  oil_jasmine: () => <JasmineOilSvg />,
  oil_sandalwood: () => <SandalwoodOilSvg />,
  oil_amber: () => <AmberOilSvg />,
  oil_frankincense: () => <FrankincenseOilSvg />,
  oil_myrrh: () => <MyrrhOilSvg />,
  oil_anointing: () => <AnointingOilSvg />,

  // ───── LOW ─────
  royal_coin_toss: () => <RoyalTokenSvg />,
  crown_spark: () => <CrownSparkSvg />,
  gold_dust: () => <GoldDustSvg />,
  royal_clap: () => <ClapHandsSvg />,
  mini_gem: () => <GemSvg fill="url(#gm-diamond)" />,
  royal_scroll: () => <ScrollSvg />,
  golden_rose: () => <RoseSvg />,
  court_applause: () => <ClapHandsSvg />,
  crown_wink: () => <CrownSvg gem="url(#gm-gold-bright)" />,
  little_scepter: () => <ScepterSvg />,
  velvet_ribbon: () => <VelvetRibbonSvg />,
  gold_feather: () => <FeatherSvg />,
  royal_seal: () => <SealStampSvg />,
  purple_sparkle: () => <SparkleClusterSvg fill="url(#gm-purple)" />,
  mini_crown_pin: () => <MiniCrownPinSvg />,
  palace_bell: () => <BellSvg />,
  golden_cup: () => <CupSvg />,
  jewel_drop: () => <JewelDropSvg />,
  royal_token: () => <RoyalTokenSvg />,
  noble_flame: () => <NobleFlameSvg />,

  // ───── POPULAR ─────
  golden_flame: () => <FlameSvg />,
  crown_burst: () => <CrownBurstSvg />,
  coin_rain: () => <CoinRainSvg />,
  mini_crown_drop: () => <CrownDescentSvg />,
  royal_banner: () => <BannerSvg />,
  treasure_chest: () => <ChestSvg />,
  gold_ribbon: () => <RibbonSvg />,
  royal_fireworks: () => <FireworkSvg />,
  crown_pulse: () => <CrownPulseSvg />,
  kings_cup: () => <KingsCupSvg />,
  queens_mirror: () => <MirrorSvg />,
  purple_torch: () => <FlameSvg fill="url(#gm-purple)" />,
  gold_lion: () => <LionSvg />,
  royal_trumpets: () => <TrumpetSvg />,
  diamond_scroll: () => <ScrollSvg />,
  noble_shield: () => <ShieldSvg />,
  crown_beacon: () => <CrownBeaconSvg />,
  palace_key: () => <KeySvg />,
  golden_laurel: () => <LaurelSvg />,
  royal_orb: () => <OrbSvg />,
  throne_spark: () => <ThroneSparkSvg />,
  crown_fire_trail: () => <CrownFlameTrailSvg />,
  royal_halo: () => <HaloCrownSvg />,
  gem_crown_flash: () => <GemCrownFlashSvg />,
  regal_starfall: () => <StarfallSvg />,

  // ───── PREMIUM ─────
  golden_wings: () => <WingsSvg />,
  throne_room: () => <ThroneSvg />,
  royal_armor: () => <ArmorSvg />,
  golden_aura: () => <RaysSvg />,
  crown_ascension: () => <CrownAscendSvg />,
  throne_rise: () => <ThroneSvg />,
  royal_guard: () => <ArmorSvg />,
  crown_steal_attempt: () => <CrownStealSvg />,
  scepter_strike: () => <ScepterStrikeSvg />,
  diamond_flame: () => <FlameSvg fill="url(#gm-diamond)" />,
  royal_phoenix: () => <PhoenixWingsSvg />,
  palace_gates: () => <PalaceGatesSvg />,
  gold_dragon: () => <DragonSvg />,
  purple_empire_flag: () => <BannerSvg />,
  kings_decree: () => <DecreeSvg />,
  queens_blessing: () => <BlessingSvg />,
  crown_thunder: () => <LightningSvg />,
  royal_meteor: () => <MeteorSvg />,
  jewel_storm: () => <JewelStormSvg />,
  crown_portal: () => <PortalSvg />,
  golden_chariot: () => <ChariotSvg />,
  royal_eclipse: () => <EclipseSvg />,
  crown_fortress: () => <CastleSvg />,
  imperial_flame: () => <ImperialFlameSvg />,
  royal_command: () => <RoyalCommandSvg />,

  // ───── LEGENDARY ─────
  diamond_crown: () => <CrownSvg fill="url(#gm-diamond)" gem="url(#gm-purple)" />,
  crown_storm: () => <CrownStormSvg />,
  global_spotlight: () => <SpotlightSvg />,
  kingdom_arrival: () => <KingdomArrivalSvg />,
  royal_coronation: () => <CrownDescentSvg />,
  crown_armada: () => <ArmadaSvg />,
  golden_empire: () => <EmpireCitySvg />,
  crown_vortex: () => <VortexSvg />,
  infinite_crown: () => (
    <g>
      <InfinitySvg />
      <g transform="translate(0 -22) scale(0.4)" style={{ transformOrigin: "50px 50px" }}><CrownSvg /></g>
    </g>
  ),
  royal_celestial: () => <StarfallSvg />,
  legendary_crown: () => (
    <g>
      <g transform="translate(-30 -10) scale(0.4)"><LightningSvg /></g>
      <g transform="translate(30 -10) scale(0.4)"><LightningSvg /></g>
      <CrownSvg fill="url(#gm-gold-bright)" gem="url(#gm-crimson)" />
    </g>
  ),
  royal_heavens: () => <HeavenCrownSvg />,
  crown_of_kings: () => <CrownsMergeSvg accent="url(#gm-purple)" />,
  crown_of_queens: () => <CrownsMergeSvg accent="url(#gm-crimson)" />,
  royal_dynasty: () => <DynastyCrestSvg />,
  empire_rise: () => <EmpireRiseSvg />,
  crown_eclipse: () => <CrownEclipseSvg />,
  eternal_palace: () => <EternalPalaceSvg />,
  royal_sunburst: () => <SunburstCrownSvg />,
  infinite_throne: () => <ThroneInfiniteSvg />,

  // ───── MYTHIC ─────
  crown_of_eternity: () => (
    <g>
      <InfinitySvg />
      <g transform="scale(0.4)" style={{ transformOrigin: "50px 50px" }}><CrownSvg fill="url(#gm-gold-bright)" gem="url(#gm-mythic)" /></g>
    </g>
  ),
  divine_throne: () => <DivineThroneSvg />,
  golden_universe: () => <UniverseSvg />,
  royal_godform: () => <GodformSvg />,
  crown_of_worlds: () => <PlanetCrownSvg />,
  celestial_dynasty: () => <CelestialDynastySvg />,
  crown_ouroboros: () => <OuroborosSvg />,
  immortal_throne: () => <ImmortalThroneSvg />,
  crown_of_creation: () => <CreationSvg />,
  god_emperor_crown: () => <GodEmperorSvg />,
};

/* ───────────────────  STYLE/MOTION HELPERS  ─────────────────── */

const TIER_AURA: Record<GiftCategory, string> = {
  low: "url(#gm-aura-gold)",
  popular: "url(#gm-aura-gold)",
  premium: "url(#gm-aura-purple)",
  legendary: "url(#gm-aura-purple)",
  mythic: "url(#gm-aura-purple)",
};

const TIER_ANIM: Record<GiftCategory, string> = {
  low: "animate-[pulse-gold_3s_ease-in-out_infinite]",
  popular: "animate-[pulse-gold_2.4s_ease-in-out_infinite]",
  premium: "animate-[pulse-purple_2.2s_ease-in-out_infinite]",
  legendary: "animate-[pulse-gold_1.8s_ease-in-out_infinite] drop-shadow-[0_0_18px_rgba(245,196,60,0.55)]",
  mythic: "animate-[mythic-aura_5s_linear_infinite] drop-shadow-[0_0_22px_rgba(193,108,255,0.65)]",
};

function FallbackCrown() {
  return <CrownSvg />;
}

/* ─────────────────────────  COMPONENT  ───────────────────────── */

function GiftIconImpl({ animationType, tier, size = "md", animated = true, className }: GiftIconProps) {
  const px = SIZE_PX[size];
  const Builder = ICON[animationType] ?? FallbackCrown;
  const aura = TIER_AURA[tier];

  const wrapStyle: CSSProperties = {
    width: px,
    height: px,
    display: "inline-block",
    flexShrink: 0,
  };

  return (
    <span style={wrapStyle} className={className} aria-hidden>
      <GiftDefs />
      <svg
        viewBox="0 0 100 100"
        width="100%"
        height="100%"
        className={animated ? TIER_ANIM[tier] : ""}
      >
        <circle cx="50" cy="50" r="48" fill={aura} />
        {tier === "mythic" && (
          <g className="origin-center" style={{ transformOrigin: "50% 50%" }}>
            <g className="animate-[spin-slow_8s_linear_infinite]" style={{ transformOrigin: "50px 50px", transformBox: "fill-box" }}>
              <circle cx="50" cy="50" r="46" fill="none" stroke="url(#gm-gold-bright)" strokeWidth="0.8" strokeDasharray="2 4" />
            </g>
          </g>
        )}
        {tier === "legendary" && (
          <circle cx="50" cy="50" r="46" fill="none" stroke="url(#gm-gold-bright)" strokeWidth="0.6" strokeDasharray="2 3" />
        )}
        <Builder />
      </svg>
    </span>
  );
}

export const GiftIcon = memo(GiftIconImpl);
export default GiftIcon;
