# Royal Pass Gift — Final Sandbox Verification

**Result: ✅ PASS (all checks green, no edits required)**

## Identifiers
- Gift row: `a2412ac4-1af0-4feb-9248-0cfd3f8ccfd5`
- Buyer: `@remyjpolo` (`06415869-792a-47fa-8af4-a563b2c02c82`)
- Recipient: `@crownmemedia` (`7934a352-2c34-4b7e-8269-e43a6765ce64`)
- Checkout Session: `cs_test_a1Hoejd35nkCNlazsDgbXP8C5P6KFD4sBXbKmXeSay0FAp9T89bpw5Aid1`
- PaymentIntent: `pi_3TwKhfK87HQxUc0w1Te43RCv`
- Stripe event: `evt_1TwKhhK87HQxUc0w35HgyFTD` (`checkout.session.completed`)

## Checks

| Check | Evidence | Result |
|---|---|---|
| Stripe session status | `status=complete`, `payment_status=paid`, `amount_total=999 usd`, `livemode=false` | ✅ |
| Event received & processed | `received_at=11:22:19Z`, `processed_at=11:22:20Z`, `last_error=null`, `attempt_count=1` | ✅ |
| `royal_pass_gifts.status` | `granted` at `11:22:20.103922Z` (was `pending` at `11:21:12Z`) | ✅ |
| Recipient grant / period extension | `royal_pass_subscriptions` for `crownmemedia` updated at `11:22:20Z`; `current_period_end` extended by 1 month to `2026-09-13 02:36:33Z` (sub `sub_1TsZjTEMO0gsPKjTtYDmvaOo`, status `active`) | ✅ |
| stripe_events errors / unprocessed (last 30 min) | `errors=0`, `unprocessed=0`, `total=1` | ✅ |
| Stripe account match | Session retrieved with `STRIPE_TEST_SECRET_KEY` → account `acct_1TSHkvK87HQxUc0w` (matches configured sandbox account) | ✅ |

## Notes
- No `royal_pass_grants` row was inserted for this gift — the fulfillment path for gifts to an already-subscribed recipient extends `royal_pass_subscriptions.current_period_end` rather than creating a grant row. The `royal_pass_gifts.granted_at` timestamp equals `royal_pass_subscriptions.updated_at`, confirming the webhook handler executed the extension.
- Metadata on the Checkout Session correctly carries `kind=royal_pass_gift`, `gift_id`, `recipient_id`, `recipient_username=crownmemedia`, `months=1`.
- Prior pending gift rows (11:03–11:08 UTC) remain `pending` because their sessions were abandoned; expected and harmless.

**No code, migration, or data changes needed.**
