# Royal Pass — Controlled Launch Checklist

This document is the gate between "code-complete" and "public launch." It
lives alongside the `royal_pass_public_launch` feature flag: when every
box below is ticked, an admin flips the flag and the sales CTA appears
for the general audience. Admins bypass the flag at all times so QA can
continue on the live site.

## 1. Automated (in-repo) proofs

- [x] `debit_shekels` / `debit_boost_token` primitives shipped and locked
      by `src/lib/__tests__/centralizedDebitPrimitives.test.ts`.
- [x] Royal Shield audit-log invariants locked by
      `src/lib/__tests__/royalShieldAuditLog.test.ts`.
- [x] Trusted-context guard locked by
      `src/lib/__tests__/profilesGuardTrustedContext.test.ts`.
- [x] All spending paths route through the primitives (Stage B). Locked
      by `src/lib/__tests__/walletDirectMutationGuard.test.ts`: no
      `UPDATE public.wallets SET shekel_balance = shekel_balance -`
      outside `debit_shekels` / `handle_royal_refund` /
      `handle_royal_dispute_*` / `refund_gift`.

## 2. Admin-triggered runtime audit (available now)

Sign in as `support@crownmemedia.com`, open `/admin/royal-shields`, and
click **Run runtime audit**. Expected outcome:

- Scenarios A–E all report `ok: true`.
- The final audit-log row for the ephemeral test user has
  `event_type = 'runtime_audit_pass'`.
- The ephemeral test user is deleted at the end (cleanup).

## 3. Staging Path B (deferred — requires Docker/staging access)

These proofs need a real Stripe sandbox and cannot run inside the
managed build sandbox. Instructions to reproduce once staging is
available:

1. Provision a staging Supabase branch + Stripe test-mode connection.
2. Run the runtime audit function against the staging URL.
3. Additionally exercise:
   - Real Stripe checkout → webhook → `royal_pass_subscriptions` upsert.
   - Real `charge.dispute.created/won/lost/reinstated` lifecycle.
   - Chargeback on a shekel purchase → `refund_gift` cascade.
4. Confirm `assert_royal_shield_invariants()` returns no drift after
   each scenario.

## 4. UI review

- [x] `RoyalPass.tsx` sales copy matches "5 shields / month" (no
      permanent shield claim). Verified — no "permanent" references
      remain in the Royal surfaces.
- [x] `RoyalPassCard.tsx` shows remaining shields (`shields_remaining/
      shields_granted`), boost tokens, and period end sourced from
      `royal_entitlements` RPC.
- [x] Founder ribbon renders only when `founder.status?.active` (and
      remaining spots > 0 in the sales hero).
- [x] Cancel-at-period-end state has distinct copy on both
      `RoyalPass.tsx` ("Ends on" + amber "Cancelling" badge) and
      `RoyalPassCard.tsx` ("Cancels on {date}").

## 5. Rollback plan

If a critical issue is discovered post-launch:

1. Flip `royal_pass_public_launch = false` in `feature_flags`. Sales
   CTA disappears within seconds via the existing realtime channel.
2. If financial integrity is at risk, additionally set
   `royal_pass_debits_paused = true` — the primitives short-circuit
   and every spending RPC returns a maintenance error.
3. File a support ticket with the audit-log run ID that first surfaced
   the drift for forensic analysis.
