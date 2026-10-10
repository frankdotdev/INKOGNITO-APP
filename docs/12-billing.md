# Inkognito Plus and claimed names
## The model
- **A name is bought once and kept for life.** Paying the first time gives the person their `@name` permanently and one month of Plus. If Plus later lapses or is cancelled, the name stays theirs, nobody else can take it, and it keeps working. Only the Plus extras switch off.
- **Plus is a monthly subscription** for things that cost money to run (today: more companion messages a day, 100 instead of 20; later: direct messages and more). Price: $3.00 or ₦4,500 a month, set in `wrangler.toml`.
- **Where the name shows:** new threads use `@name` instead of a generated one, if the owner leaves "Speak as @name" on. Threads already joined keep the name they had. There is a small public page at `/a/<name>` listing posts made under it. No followers, no counts of people.
- **Rules:** 3-20 characters, lowercase letters, numbers, single underscores, starting with a letter. One name per identity. A list of reserved names (admin, support, inkognito and others, in `private.reserved_aliases`). A name can be removed by a super admin or safety moderator for impersonation or abuse (`admin_revoke_alias`, audited). A removed name can never be claimed by someone else.
- **Honest limits shown to buyers:** the name belongs to the anonymous identity, so losing every device with no recovery code loses it; names can be removed for breaking rules.

## Privacy
Paystack needs an email. Inkognito never asks for one: each order sends Paystack `<order reference>@<PAYMENT_EMAIL_DOMAIN>`, an address that receives nothing. The payment provider holds the card details and billing identity; our database holds only the order reference, amount, currency and Paystack's customer and subscription codes. Nothing links a payment to posts except the internal identity id, which no one outside the database sees. Paystack is sent no alias or identity details.

## How a payment flows
```
Plus screen -> Billing Worker /checkout -> database order (alias reserved 30 min) -> Paystack payment page
Paystack -> customer returns to /settings/plus/return -> Worker /verify -> asks Paystack itself -> grants name + Plus
Paystack -> /billing/webhook (HMAC-SHA512 signed) -> same confirmation, plus renewals, cancellations, failed charges
```
Nothing is granted because a browser says so: the Worker always confirms the transaction, amount and currency with Paystack, and granting is idempotent (return page and webhook can both fire). Amount mismatches or a name taken at the same moment are held as `needs_review` instead of guessed.

## Deploy
1. Run `0011_billing.sql`. 2. In Paystack (use **test mode** first): create two monthly plans, USD 3.00 and NGN 4,500.00 (USD must be enabled on the account and your business approved for international payments), and note their codes. 3. In `cloudflare/workers/billing`: fill `wrangler.toml` (URLs, plan codes, `PAYMENT_EMAIL_DOMAIN`), then `wrangler secret put SUPABASE_SERVICE_KEY` and `PAYSTACK_SECRET_KEY`, then `wrangler deploy`. 4. In Paystack, set the webhook URL to `https://<worker>/billing/webhook`. 5. Set `NEXT_PUBLIC_BILLING_URL` for the web app. 6. Run one full test-mode purchase, renewal and cancellation before going live.

## Tested, and not tested
- Database (Postgres): alias rules and reservations, idempotent completion, wrong amounts held, a subscription code arriving before the order, renewals and duplicates, lapse keeps the name, cancel keeps the paid period, alias used in new threads and switched off, public page, revocation, Plus raising the AI limit.
- Worker (`cloudflare/workers/billing/e2e.mjs`, 19 checks) against **stand-ins** for Supabase and Paystack: auth, validation, signature checks, amounts from configuration, verification, idempotency, retry on failure, mismatch review, NGN plan, cancellation.
- **Not tested against real Paystack.** The stand-in follows Paystack's documented API as I know it (initialize, verify, subscription fetch and disable, `charge.success`, `subscription.create`, `subscription.disable`, `invoice.payment_failed`). One difference already found: Paystack reports an unpaid transaction as `abandoned`, which the Worker now treats as still pending. Expect to adjust field names in test mode. The web screens have not been run in a browser.
- **Not built:** refunds and an admin view of orders needing review (look in `private.orders` where `status = 'needs_review'`), receipts, currency detection beyond the browser language, prorating, and other providers (the schema and Worker are provider-labelled so Flutterwave or Stripe can be added).
