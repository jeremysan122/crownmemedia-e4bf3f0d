# Royal Pass — Close the Remaining Gaps

Working through the ❌ and 🟡 items in order. Each stage ends with source-contract tests and (where possible) an admin-triggerable runtime audit that runs against `support@crownmemedia.com`. Path B runtime proofs that need Docker/staging stay documented as deferred, not silently skipped.

## Stage A — Centralized debit primitives (❌ → ✅)

Two new `SECURITY DEFINER` SQL primitives that every spend path must go through. They are the only functions allowed to mutate `wallets.shekel_balance` or `boost_tokens_ledger` for user-initiated spending.

1. `debit_shekels(_user_id, _amount, _reason_code, _ref_table, _ref_id, _metadata)`
   - `FOR UPDATE` lock on the wallet row.
   - Refuses negative/zero amounts. Refuses if `balance < amount`.
   - Writes a `shekel_ledger` row with `kind='debit'`, reason code, and ref pointer.
   - Returns `{ ledger_id, new_balance }`.
   - Revoked from `anon`/`authenticated`; callable only via `SECURITY DEFINER` wrappers or `service_role`.

2. `debit_boost_token(_user_id, _reason_code, _ref_table, _ref_id, _metadata)`
   - Consumes exactly one token, FIFO across active `boost_tokens_ledger` grants.
   - Emits paired debit row referencing the grant it came from (Royal vs purchased).
   - Same lock + revoke story as above.

Both write an `admin_audit_log` breadcrumb so the reconciliation dashboard can trace every debit back to a caller RPC.

## Stage B — Route every spending path through the primitives (❌ → ✅)

Audit and rewrite each RPC/edge function that currently touches balances directly:

- `send_gift` / `send_gift_dm` / live-battle gift RPCs → call `debit_shekels`.
- `apply_boost` / `start_boost` → call `debit_boost_token`.
- `spin_wheel` cost path → `debit_shekels`.
- Any create-post / verification-fee path that spends shekels.

Direct `UPDATE wallets SET shekel_balance = ...` outside the two primitives becomes a lint-level failure: add a source-contract test that greps for the forbidden pattern.

## Stage C — Gift refund allocation (❌ → ✅)

New RPC `refund_gift(_gift_id, _reason_code)`:
- Locks the original `gift_transactions` row + both wallet rows.
- Reverses the recipient credit and the sender debit atomically.
- If the refund crosses a Royal promo-consumption boundary, rebuild the FIFO allocation via `gift_spend_allocations`.
- Writes a `royal_pass_reversals` row with `source='gift'` and links back to the ledger entries.
- Idempotent on `(gift_id, reason_code)`.

Wired into the existing dispute/refund funnel so a Stripe chargeback on a shekel purchase can cascade into gift-level reversals when required.

## Stage D — Admin reconciliation dashboard (❌ → ✅)

Extend `/admin/royal-shields` with a second tab **Reconciliation** showing, per user with any Royal activity:
- Wallet balance vs. sum-of-ledger (must equal).
- Boost tokens remaining vs. sum-of-ledger.
- Shield credits granted vs. used vs. reversed vs. active sessions (already in place — surfaced here).
- Per-row "Drift?" badge and a **Recompute** action.

Backed by a new admin RPC `admin_royal_reconciliation(_limit, _offset, _filter)` that joins the three canonical views and returns a paged report. Manual "Run full sweep" button reuses the audit-log infrastructure so every reconciliation run is recorded.

## Stage E — Final Royal UI review (🟡 → ✅)

Sweep the user-facing surfaces once more:
- `RoyalPass.tsx` sales page copy matches the actual entitlements (5 shields/month, no permanent shield).
- `RoyalPassCard.tsx` + `useRoyalEntitlements` show remaining shields, boost tokens, and period end without flicker.
- Founder ribbon renders only when `is_founder && active`.
- Renewals & cancel-at-period-end states have distinct copy.

## Stage F — Staging gate & controlled launch (❌ → 🟡 documented)

I cannot flip the "staging complete" bit from inside the sandbox — Docker/staging access is still required to execute Path B lifecycle proofs end-to-end. I will:
- Add `docs/royal-pass-launch-checklist.md` with the exact runtime audit steps, expected results, and rollback plan.
- Wire a feature flag `royal_pass_public_launch` (default `false`) that gates the public sales page CTA; internal admins bypass it. Flip flag = launch, no code change required.

## Technical notes

- All new SQL lands in one migration per stage so approvals stay reviewable.
- `service_role` is granted execute on the primitives; `anon`/`authenticated` are revoked.
- Every new RPC gets a source-contract test file under `src/lib/__tests__/`.
- The admin runtime audit edge function (`admin-royal-runtime-audit`) is extended with new scenarios F–I covering the primitives, gift refund, and reconciliation drift detection.

## Out of scope this pass

- Wave 4.5 broadcast-quality beauty filters (still deferred; requires media pipeline work).
- Wave 6.5 highlight-card persistence (deferred; needs storage design).
- Real end-to-end Path B proofs against a live Stripe sandbox — requires staging access.
