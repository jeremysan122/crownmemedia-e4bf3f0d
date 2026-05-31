## Scope

Five independent workstreams, all secure and RLS-safe. I'll implement in this order so each can ship without blocking the next. This is a large change set — flagging up front so we agree on scope before I touch files.

---

### Part 1 — Broken Crown / Dislike sound

- Generate a short (~0.6s) "cracked-crown / soft metal break" SFX via ElevenLabs and store at `src/assets/broken-crown.mp3`. (Falls back to a tiny synthesized WebAudio "thud" if generation fails so the feature never blocks.)
- New `src/lib/sounds.ts` utility: lazy `HTMLAudioElement` cache, ~250 ms throttle, fail-silent on `Audio` errors, respects `localStorage.crownme:sound-muted` (future settings hook), light `navigator.vibrate(15)` when available.
- Wire into `src/components/PostCard.tsx` inside the dislike branch of `onVote` — only after the optimistic UI commits. Like/crown/fire/diamond chimes via `fxVote` stay untouched.

### Part 2 — Legal docs versioning

- Add a shared `<LegalDocHeader>` component (`src/components/legal/LegalDocHeader.tsx`) rendering title, **Version 1.0**, **Effective Date: May 30, 2026**, **Last Updated: May 30, 2026**, owner line "CrownMe Media, a product of Talent Connect World LLC", and `legal@crownmemedia.com` contact.
- Insert it at the top of every page in `src/pages/legal/`: TermsOfService, PrivacyPolicy, CommunityGuidelines, AcceptableUse, CookiePolicy, DmcaPolicy, CsaePolicy, Eula, SubscriptionTerms, VirtualGoodsPolicy, ContactLegal.
- Update `LegalCenter.tsx` to list every policy with its version + last-updated date pulled from a single `LEGAL_DOCS` registry (`src/lib/legalDocs.ts`) so footer + Legal Center + headers stay in sync.
- Verify `AppFooter.tsx` links match the registry; fix any broken paths.
- Add an HTML comment at the top of each page: `<!-- Internal: drafted by product team; requires attorney review before public launch. -->`
- **Not building** the optional `legal_documents` DB table — current pages are static React, adding a CMS is out of scope unless you ask.

### Part 3 — Notifications "Mark all read"

- Add button to `src/pages/Notifications.tsx` header, visible only when `unread_count > 0`.
- New SECURITY DEFINER RPC `mark_all_notifications_read()` that updates `notifications` where `user_id = auth.uid() AND read = false` and returns the row count. Granted to `authenticated` only.
- Optimistic UI + `useUnreadByType` invalidation. Toast on success/failure. Button disabled while in-flight.

### Part 4 — Inbox "Mark all read"

- Audit `src/pages/Messages.tsx` and `src/hooks/useThreadUnread.ts` to determine the right read marker (per-message `read_at` on `messages` where `receiver_id = auth.uid()`).
- New RPC `mark_all_messages_read()` doing `UPDATE messages SET read_at = now() WHERE receiver_id = auth.uid() AND read_at IS NULL`.
- Button in Messages header, visible only when there are unread threads; optimistic + invalidate.

### Part 5 — Reply to comments

Database migration:
- `comments` already has `parent_id` (confirmed via grep). Add if missing: index on `(parent_id)`, `reply_count int default 0` on parent rows maintained by trigger.
- Trigger `trg_comments_reply_count`: on insert/delete of a comment with non-null `parent_id`, bump/decrement `reply_count` on the parent. Also enforce: parent must belong to same `post_id`, and depth is capped at 1 (parent's `parent_id` must be null).
- Existing notification trigger `trg_notify_comment_reply` already covers reply notifications — verified in earlier audit.
- RLS unchanged — current comment policies already self-scope inserts and allow public read on visible posts.

Frontend (`src/components/CommentsDrawer.tsx`):
- Group fetched comments into `top-level` + `replies[parentId]`. Render replies indented under each parent, collapsed behind "View N replies" when `reply_count > 0`.
- Add `replyingTo: { commentId, username } | null` state. "Reply" button on each top-level comment sets it; composer placeholder becomes `Reply to @username…`; small chip above input with an X to cancel.
- On send: if `replyingTo` is set, include `parent_id` in insert. Optimistic insert under the right parent, rollback on failure.
- `crownme:comment-added` event payload extended with `parentId?: string` so listeners can bump the right count. Post `comment_count` continues to include replies (DB trigger already counts all rows).
- Lazy-load replies: only fetch a parent's replies when user expands, up to 50 per request.

---

## Files I expect to touch

```text
new   src/assets/broken-crown.mp3
new   src/lib/sounds.ts
new   src/lib/legalDocs.ts
new   src/components/legal/LegalDocHeader.tsx
edit  src/components/PostCard.tsx              (sound trigger)
edit  src/components/CommentsDrawer.tsx        (replies UI)
edit  src/pages/Notifications.tsx              (mark all read)
edit  src/pages/Messages.tsx                   (mark all read)
edit  src/pages/legal/*.tsx                    (11 files: insert header)
edit  src/components/AppFooter.tsx             (verify links)
new   supabase migration                       (RPCs + reply trigger + index)
```

## Risks / explicit non-goals

- I will **not** build a legal CMS table unless you ask — pages stay static React with a shared header.
- I will **not** change vote scoring, gifts, Royal Pass, wallet logic, or any other unrelated surface.
- ElevenLabs SFX generation needs an API key. If `ELEVENLABS_API_KEY` isn't already set, I'll fall back to a synthesized WebAudio "crack" sound (no asset file, no secret prompt) so this part doesn't block.
- Final legal review by an attorney is still required — I'll add the internal comment but cannot replace counsel.

Reply **approve** to proceed, or tell me which parts to drop / reorder.