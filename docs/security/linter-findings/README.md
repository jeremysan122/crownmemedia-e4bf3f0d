# Supabase Linter Findings — Full Inventory

**Last scan:** 2026-07-08 — **120 warnings, 0 errors.**

Every finding is `WARN` severity and falls into just three rules. This folder documents each one with the actual rule, why it fires, the exact code involved, and why we accept it or how it's mitigated.

| Rule | Count | File | Verdict |
|---|---|---|---|
| `0024_permissive_rls_policy` — RLS Policy Always True | 1 | [0024-permissive-rls-policy.md](./0024-permissive-rls-policy.md) | Accepted — intentional pairing with a sibling ownership policy |
| `0028_anon_security_definer_function_executable` — Public Can Execute `SECURITY DEFINER` Function | 25 | [0028-anon-security-definer.md](./0028-anon-security-definer.md) | Accepted — each function guards itself |
| `0029_authenticated_security_definer_function_executable` — Signed-In Users Can Execute `SECURITY DEFINER` Function | 94 | [0029-authenticated-security-definer.md](./0029-authenticated-security-definer.md) | Accepted — RPC-first architecture; each function re-checks role/ownership |

## Overall justification

Every mutation in this app now flows through an RPC (`SECURITY DEFINER` function) rather than a direct table `UPDATE`. That's the direct result of the launch-hardening work you approved (posts, comments, `verification_requests`, `sensitive_appeals`, `profiles.verified`). Each swap of "direct table write" → "admin RPC" **increases** the 0028/0029 counts by one, because the lint counts every `SECURITY DEFINER` function callable by `anon`/`authenticated` — regardless of whether the function internally validates the caller.

The lint is an **inventory** signal, not a vulnerability signal. Each function:

1. Runs with a pinned `SET search_path = public` (prevents search-path hijack).
2. Re-checks `auth.uid()` and, where relevant, `has_role(auth.uid(), 'admin'|'moderator')`.
3. Returns only rows the caller is entitled to see.
4. Writes only through validated code paths, with audit-log side effects for admin actions.

If we switched these to `SECURITY INVOKER` the app would break — most read RLS on internal tables (`admin_audit_log`, `moderation_queue`, `wallets`, `shekel_ledger`, `crown_map_points`, etc.) that `anon`/`authenticated` are intentionally not granted access to.

## What we do NOT accept

- **ERROR-level findings** — currently zero. The previous errors (`verification_requests_status_privilege_escalation`, `sensitive_appeals_withdraw_privilege_escalation`, `posts_owner_update_no_column_restriction`, `comments_owner_update_no_column_restriction`, `profiles_verified_badge_self_escalation`) are all resolved via the accepted lockdown migrations.
- **Location-related findings** — currently zero. Crown Map location privacy (`crown_map_points` RLS, no precise-location warning, no user/profile/home/device location exposure) remains clean.

## How to re-check

Run the Supabase database linter through the Lovable security tools. The output should still be three rule IDs only (`0024`, `0028`, `0029`). Any new rule ID means a new class of issue and must be triaged before launch.
