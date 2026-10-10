# Launch checklist
Nothing here is optional unless it says so. Work top to bottom.

## Blockers (do not open to the public without these)
- [ ] **Terms of Service and Privacy Policy** reviewed by a lawyer. Drafts that match the product are already in `apps/web/content/legal/terms.md` and `privacy.md` (pages, Settings and onboarding are live). Replace the operator contact blocks with your legal entity. The in-app Privacy page is a plain-language summary, not a substitute for the policy.
- [ ] **Image scanning.** Image posts are held in the admin review queue by default (`16-image-review-captcha-legal.md`); staff the queue before launch. Also enable Cloudflare's CSAM Scanning Tool on the media domain, add automated image moderation that sets `moderation_state = 'review'`, and make sure someone is on call to act on reports.
- [ ] **Child safety procedure.** Decide who receives urgent reports, how quickly they act, and your legal duties to report child sexual abuse material where you operate and host (take legal advice). Reports with `priority = 2` appear first in the admin queue.
- [ ] **Crisis handling review.** Have a qualified person review the AI Companion's safety prompt and the helpline card, and add local helplines for your main countries (`components/CrisisCard.tsx`, `cloudflare/workers/ai/src/safety.ts`).
- [ ] **Anonymous sign-up abuse protection.** Anyone can create anonymous accounts. Turn on CAPTCHA protection in Supabase Auth (Cloudflare Turnstile), set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in both apps, and set Supabase Auth rate limits.
- [ ] **Paystack test-mode run**: one purchase, one renewal, one cancellation, one failed charge, in both currencies you offer. Confirm international payments are approved on your account before taking dollars.
- [ ] **Secrets in place and nothing in git**: `SUPABASE_SERVICE_KEY`, `PAYSTACK_SECRET_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `AI_DATA_KEY` and `DM_DATA_KEY` (back both up; losing one makes that history unreadable), `ROOM_SECRET`. Set a spend limit on Groq and Google.
- [ ] **Backups.** The Free plan has no point-in-time recovery. Move to Supabase Pro (daily backups; PITR is an add-on) before real users, or schedule your own dumps.
- [ ] **First admin created, MFA enrolled, email sign-ups disabled** (`10-admin.md`).

- [ ] **Audio and video stay off** (`17-audio-video.md`) until moderators, a minors procedure and an age-verification decision are in place.

- [ ] **Decide image scanning.** Set `SCAN_PROVIDER` and `OPENAI_API_KEY` on the media Worker if you want automated checks (images go to OpenAI; say so in your Privacy Policy), and enable Cloudflare's CSAM Scanning Tool regardless. Keep `media_review_required` at 1 until you trust the results.
- [ ] **Push:** generate VAPID keys, deploy the push Worker, set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, test on Android and iPhone (installed app).
- [ ] **Refunds:** add the admin origin to the billing Worker's `ALLOWED_ORIGINS`, set `NEXT_PUBLIC_BILLING_URL` in the admin app, test a refund in Paystack test mode and check the `refund.processed` payload fields.
- [ ] **Decide the refund policy** (30 days, takes back the name and Plus month) and publish it in your Terms.

## Configuration
- [ ] Allowed origins on all four Workers set to the real web origin only.
- [ ] `pg_cron` enabled in Supabase so `private.cleanup_expired()` runs (expiry, retention, uploads, pairings). Check `cron.job_run_details` after a day.
- [ ] Separate Supabase projects, R2 buckets, Worker environments and keys for development, staging and production.
- [ ] Custom domains: app, admin (own subdomain), media Worker, random Worker, AI Worker, billing Worker. HTTPS everywhere.
- [ ] Cloudflare rate limiting rules on `/ai/chat`, `/upload`, `/match`, `/billing/checkout`, and on the Supabase API domain if you use a custom domain.
- [ ] `NEXT_PUBLIC_SITE_URL` set, so share cards and manifests resolve. Decide whether share pages stay `noindex` (`06-sharing.md`).
- [ ] `ai_free_daily_limit`, `ai_plus_daily_limit` and plan prices decided and set (`11-ai.md`, `12-billing.md`).

## Verify on real devices (not done in this build)
- [ ] Run the web app in a real browser on Android and iPhone: onboarding, post, comment, react, share (check the preview card in WhatsApp and Telegram), random chat with two phones, image upload from a phone camera (check location data is gone), AI chat, device linking by QR, install to home screen, offline behaviour.
- [ ] Accessibility pass (screen reader, keyboard, large text) and a slow-network pass.
- [ ] Load test the Supabase functions and each Worker at the traffic you expect on launch day.

## Watch after launch (in this order)
Database size (60% is the upgrade line), query latency, open reports and time to action, Worker errors, AI and payment provider spend, random chat reports per 1,000 chats. The admin dashboard shows most of these. See `14-operations.md`.
