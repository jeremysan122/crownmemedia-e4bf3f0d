# Wave 8 — Full Achievements Overhaul

Sliced into 4 sub-waves so each is testable and revertible. All 4 ship in this wave unless you say stop.

## 8A — Data Model & Catalog

**Schema (migration)**
- Extend `achievement_definitions`:
  - `reward_type` widened via check: `frame_unlock | badge_unlock | title_unlock | shekel_grant | boost_grant`
  - `reward_payload jsonb` (badge slug, title text, amount, etc.)
- New tables:
  - `badges` (slug, name, icon, rarity, description) + GRANTs + RLS
  - `titles` (slug, text, rarity) + GRANTs + RLS
  - `user_badges` (user_id, badge_slug, unlocked_at) + RLS (owner+admin read, service write)
  - `user_titles` (user_id, title_slug, equipped bool) + RLS
- Seed:
  - ~20 non-frame achievements: badges (First Battle, First Crown, Streak 7/30/100, Verified Voter, Top Fan), titles (Contender, Champion, Legend), seasonal (`starts_at`/`ends_at`) — Summer 2026 event.
  - Mark 5 as `is_secret=true`, 3 as `is_repeatable=true` (weekly variants).
- Rebalance founder-only flags: ensure ≥60 achievements visible to non-founders.

**RPCs**
- `equip_title(_slug)` / `unequip_title()`
- `equip_badge(_slug)` (single showcase)
- Extend unlock processor to handle new reward types.

## 8B — Achievements Page UX (`/achievements`)

- Search input (name/description)
- Sort dropdown: Rarity ↓ / Progress ↓ / Recently unlocked / Closest to complete
- Rarity filter chips (Common → Legendary) with legend tooltip
- "Next Up" card at top — closest incomplete achievement with progress bar
- Reward preview on card: mini frame/badge/title chip
- Distinct **Locked/Gated** visual state (blurred + lock overlay + unlock hint)
- Secret achievements: `??? Hidden` card until unlocked
- Share button on completed achievements → OG share card
- Collections: icons + descriptions + explicit ordering column
- Weekly Quests: streak counter + last-4-weeks history strip

## 8C — Cross-Surface

- **Toast + notification** on any achievement unlock (not just frames): `useAchievementUnlockToaster` global mount
- **Profile achievement feed**: chronological log tab on `/profile/:username` (recent 20 unlocks)
- **Equipped title** rendered inline under username on Profile + comment author chip
- **Equipped badge** slot next to Founder/RoyalPass badges

## 8D — Admin Authoring

- New tab in Command Center: `CommandCenterAchievementAuthor.tsx`
  - Create / edit / disable achievement definitions
  - Set thresholds, rarity, reward_type/payload, secret/repeatable, time window, founder-only
  - Preview card
- Audit entries to `admin_audit_log`.

## Testing
- New unit tests: search/sort/filter, secret hiding, reward-preview mapping, equip_title RPC
- Integration: unlock flow emits toast + notification + audit
- Target: +30 tests (≈1050 total)

## Out of scope (call out to defer)
- Real OG image server for share cards (uses static template for now)
- Push notification delivery beyond in-app

Confirm and I'll execute 8A → 8D end-to-end.
