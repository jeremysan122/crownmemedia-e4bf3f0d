# Reports & Appeals — RLS Verification Checklist

Run these checks (Supabase SQL editor or psql) signed in as different users to confirm Row-Level Security is correctly preventing cross-user access. Replace `<USER_A>`, `<USER_B>`, `<REPORT_A>`, `<APPEAL_A>` with real UUIDs from your environment.

> Setup: create two non-admin test users (User A and User B). User A submits a report (`<REPORT_A>`) and an appeal (`<APPEAL_A>`).

## 1. Reports table

| # | Action | Expected |
|---|---|---|
| 1.1 | As **User B**, `SELECT * FROM public.reports WHERE id = '<REPORT_A>';` | **0 rows** (cannot see User A's report) |
| 1.2 | As **User A**, same query | **1 row** (own report visible) |
| 1.3 | As **User A**, `UPDATE public.reports SET status='resolved' WHERE id='<REPORT_A>';` | **0 rows updated** (mods/admins only) |
| 1.4 | As **User B**, `UPDATE public.reports SET mod_notes='x' WHERE id='<REPORT_A>';` | **0 rows updated** |
| 1.5 | As a **moderator**, `UPDATE public.reports SET status='action_taken', mod_notes='Reviewed' WHERE id='<REPORT_A>';` | **1 row updated** |
| 1.6 | As **anon** (logged out), any SELECT/INSERT on `public.reports` | **denied** (restrictive deny-anon policy) |
| 1.7 | As **User A**, `INSERT INTO public.reports (reporter_id, post_id, reason) VALUES ('<USER_B>', ..., 'spam');` | **rejected** (reporter_id must equal auth.uid()) |

## 2. Report appeals table

| # | Action | Expected |
|---|---|---|
| 2.1 | As **User B**, `SELECT * FROM public.report_appeals WHERE id='<APPEAL_A>';` | **0 rows** |
| 2.2 | As **User A**, same query | **1 row** |
| 2.3 | As **User B**, attempt to insert appeal for User A's report:<br>`INSERT INTO public.report_appeals (report_id, user_id, body) VALUES ('<REPORT_A>', '<USER_B>', 'long text...');` | **rejected** (WITH CHECK requires reporter_id = auth.uid()) |
| 2.4 | As **User A**, `UPDATE public.report_appeals SET status='approved' WHERE id='<APPEAL_A>';` | **0 rows updated** |
| 2.5 | As a **moderator**, `UPDATE public.report_appeals SET status='approved', mod_notes='Granted' WHERE id='<APPEAL_A>';` | **1 row updated** |
| 2.6 | As **User A**, attempt second appeal with body shorter than 20 chars | **rejected** (length check in policy) |

## 3. Evidence storage bucket (`evidence`, private)

| # | Action | Expected |
|---|---|---|
| 3.1 | As **User B**, list/download object at `<USER_A>/<file>` | **denied** (foldername must match auth.uid()) |
| 3.2 | As **User A**, upload to `<USER_B>/x.jpg` | **denied** |
| 3.3 | As **User A**, upload to `<USER_A>/x.jpg` | **allowed** |
| 3.4 | As **User A**, `UPDATE` (overwrite) any object in `evidence` | **denied** (RESTRICTIVE "Evidence no update" policy) |
| 3.5 | As **User A**, delete `<USER_A>/x.jpg` | **allowed** (owner cleanup) |
| 3.6 | As **User B**, delete `<USER_A>/x.jpg` | **denied** |
| 3.7 | As a **moderator**, list/download `<USER_A>/x.jpg` | **allowed** |
| 3.8 | As **anon**, any access to bucket `evidence` | **denied** (bucket is private + no anon policy) |
| 3.9 | As **User B**, `supabase.storage.from('evidence').createSignedUrl('<USER_A>/x.jpg', 60)` | **error** (SELECT policy denies — User B cannot mint a URL) |
| 3.10 | As a **moderator**, same `createSignedUrl(...)` call | **returns a URL** |
| 3.11 | Once a moderator-issued signed URL exists, share it with User B and `curl` it within 10 min | **200 OK** — by Supabase Storage design, signed URLs embed access for their TTL. **Mitigation:** keep TTL short (we use 600s), never log/share URLs. |

### Automated test (signed URL gating)

Add to your test runner (Vitest + a service-role helper that creates throwaway users) — see `src/lib/__tests__/evidenceRls.test.ts` for a runnable scaffold. The key assertion:

```ts
// User B is signed in
const { data, error } = await userBClient.storage
  .from("evidence")
  .createSignedUrl(`${userA.id}/reports/anything.jpg`, 60);
expect(data?.signedUrl).toBeUndefined();
expect(error).toBeTruthy(); // RLS blocks signing
```


## 4. SECURITY DEFINER lockdown

All elevated-privilege logic lives in the `private` schema (not exposed via PostgREST). Public wrappers are `SECURITY INVOKER` and call the private DEFINER functions internally.

Run as a signed-in non-admin user via PostgREST RPC (e.g. `supabase.rpc(...)`):

| # | RPC | Expected |
|---|---|---|
| 4.1 | `has_role(<uid>, 'admin')` | **403 / function not found** (EXECUTE revoked) |
| 4.2 | `is_thread_muted(...)` | **403 / function not found** |
| 4.3 | `notif_pref(...)` | **403 / function not found** |
| 4.4 | `get_my_profile_sensitive()` | **403 / function not found** |
| 4.5 | `assert_security_invariants()` | **403 / function not found** |
| 4.6 | `bump_filter_streak('vivid')` | **success** (INVOKER wrapper → private DEFINER) |
| 4.7 | `confirm_my_age('2000-01-01')` | **success** (pure INVOKER, RLS allows self write) |
| 4.8 | `ensure_my_wallet()` | **success** (INVOKER wrapper → private DEFINER) |
| 4.9 | `is_royal_pass_active(<uid>)` | **success** (INVOKER wrapper → private DEFINER) |
| 4.10 | `purchase_boost('royal_boost', 24, 500)` | **success or 'Insufficient Shekels'** (INVOKER wrapper) |
| 4.11 | `send_royal_gift('crown_blast', <uid>, null, 1)` | **success or 'Insufficient Shekels'** (INVOKER wrapper) |
| 4.12 | Any call to `private.*` functions | **404 / schema not exposed** |
| 4.13 | Linter 0029 (authenticated SECURITY DEFINER) | **0 warnings** |
| 4.14 | Linter 0014 (extension in public) | **0 warnings** — `pg_net` lives in `extensions` schema |

## 5. Public bucket listing (lint 0025)

| # | Action | Expected |
|---|---|---|
| 5.1 | `supabase.storage.from('avatars').list()` (no path) as a non-owner authenticated user | **0 rows** (owner-scoped SELECT) |
| 5.2 | Direct CDN URL access via `getPublicUrl(path)` | **still works** (public download endpoint bypasses RLS) |
| 5.3 | Same as 5.1 for buckets `posts`, `banners`, `share-cards`, `media` | **0 rows for non-owners** |

## How to run

- In the Supabase SQL editor, switch role with `SET request.jwt.claims = '{"sub":"<USER_UUID>","role":"authenticated"}';` then `SET ROLE authenticated;` and run the query.
- For RPC checks, use the Lovable preview signed in as the relevant user and call `supabase.rpc(...)` from the browser console.
- Re-run the Supabase linter (`supabase--linter`) after any schema change. Expected baseline: 0 errors, only the documented accepted warnings (extension_in_public + 6 intentionally-exposed SECURITY DEFINER RPCs already justified in the security memory).

_Last updated: May 2, 2026_
