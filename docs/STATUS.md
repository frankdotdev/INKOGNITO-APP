# Inkognito: progress, and what is not built
Read this first. It is the honest state of the project.

## In one paragraph
Inkognito is a working first build of an anonymous social platform: a Next.js web app (installable PWA), a separate admin app, a PostgreSQL schema (19 migrations) that enforces the security rules, and six Cloudflare Workers (random chat, image upload and scanning, AI companion, payments and refunds, private chats, push notifications). Every layer has automated tests that pass. The product code is launch-shaped (including draft Terms and Privacy, a Content Security Policy, and error pages). **None of it has been run against real services or on a real phone.** A public launch still depends on the operational items in `13-launch-checklist.md`: lawyer review of the legal drafts, real provider accounts, moderators, backups, and device testing.

## What has been tested, and what that does and does not prove
| Layer | How it was tested | What that proves | What it does not prove |
|---|---|---|---|
| Database (19 migrations) | 15 SQL suites on a real PostgreSQL 16 with a stand-in for Supabase's `auth` schema and roles (`supabase/tests/run.sh`) | The permission rules, limits, flows and edge cases work as written | That Supabase's real roles and settings behave identically (for example that the database owner bypasses row-level security, as these functions assume) |
| Workers (6) | Each runs under `wrangler dev` with stand-ins for Supabase, Paystack, Groq, Gemini and OpenAI (`cloudflare/workers/run-e2e.mjs <name>`) | The Worker logic: auth, validation, limits, flows, error handling, encryption (push output is decrypted by an independent library) | Behaviour against the real third-party APIs, real Cloudflare, real traffic |
| Web and admin apps | TypeScript typecheck and `next build` for production | They compile and prerender | Anything that happens in a browser: layout, clicks, forms, camera, notifications, the service worker in a real browser |
| Service worker | Logic test with fake caches and events (`apps/web/test/sw.test.mjs`) | What it caches and refuses to cache; push handling | Behaviour in a real browser |

**Not done at all:** opening the app in a browser or phone, connecting a real Supabase project, calling real Paystack, Groq, Gemini, OpenAI or Turnstile, deploying to Cloudflare, load testing, an accessibility audit, a security review by a person. Expect bugs at those seams.

## Built
**Core product (web):** onboarding; the Void feed; composer (mood, category, poll, fading, up to 4 images, drafts); confession detail; comments with replies; reactions; Echoes; bookmarks; Whispers; reports and blocks everywhere; Discover (trending, fresh, deep, questions, polls, echoed, categories); search (posts and claimed names); Take Me Somewhere; My Inkognito (confessions, comments, Echoes, saved, activity); share cards for posts and comments; settings (appearance with 7 themes, privacy, safety, blocked people, notifications, identity, Plus); offline shell; installable on Android and desktop.
**Identity:** anonymous sign-in, a different generated name per thread, multi-device linking by QR, recovery code, device list and removal, purge this device, delete identity, delete my content.
**Random chat:** text (live); audio and video (built, switched off by default, adults-only confirmation, TURN support).
**Private chats:** one-to-one, started from a post, comment or Whisper; Plus to start, free to reply; encrypted at rest (not end-to-end).
**AI companion:** Groq with Gemini fallback, streamed replies, six modes, daily quota, encrypted history, crisis detection with a fixed helpline card.
**Plus and names:** a name bought once and kept for life; monthly Plus; Paystack payments in USD and naira; cancel; refunds from the admin app; public name page.
**Safety and moderation:** report queue, image review queue (held by default), automated image scanning through OpenAI moderation (optional), moderators' tools, image scan log, audit log, MFA-gated admin with six roles, finance tools.
**Smaller features:** private resonance and streaks; push notifications (replies, Whispers, private messages, optional Echoes; never any content); draft Terms and Privacy pages (need lawyer review and your operator details); nonce-based Content Security Policy; error and not-found pages.
**Engineering:** CI workflow, test runners, runbooks, launch checklist.

## NOT built
| Item | Why it isn't built | What it would take |
|---|---|---|
| **End-to-end encrypted private chats** | Needs per-device key handling across linked devices and recovery. Designed in `22-e2ee-design.md`, not written, because getting key transfer wrong silently breaks privacy and it needs a browser to test the integration. Today's chats are encrypted at rest only: our servers can decrypt them, and the app says so. | The design is ready: client crypto library, four database functions, changes to linking, recovery, and the chat screens. Roughly one focused build pass, plus testing on devices. |
| **A native Android app** | A native app would be a second front end for about 70 screens that cannot be verified without Android devices. See `18-android.md`. The web app installs on Android today and can be wrapped for Google Play as a Trusted Web Activity (`/.well-known/assetlinks.json` is already served). Web push works in it. | If you want native later: React Native sharing `packages/core`, which would also give device-bound key storage for E2EE. |
| **Lawyer-reviewed Terms and Privacy** | Drafts that match the product now live in `apps/web/content/legal/terms.md` and `privacy.md` (pages, Settings links and onboarding agreement are live). They are not legal advice and still need counsel plus your entity details. | A lawyer review; replace the contact blocks. |
| Hash-based child-safety scanning | Cloudflare's CSAM Scanning Tool is a dashboard setting, not code, and needs your Cloudflare account. The OpenAI check built here is a general classifier, **not** a substitute: it can miss things and does not match known abuse images. | Turn on Cloudflare's tool; decide whether to add a provider such as PhotoDNA; set up reporting duties with a lawyer. |
| Real age verification | Audio and video use a self-declared "I am 18 or older". Anyone can tick it. | A third-party age assurance provider and legal advice. |
| Moderator staffing | Software cannot do this. The review queue, scan log and reports exist; people must watch them. | Hire or assign moderators before launch. |
| Forward secrecy and verified keys for private chats | Part of the E2EE design. | See `22-e2ee-design.md`. |
| Other payment providers, alias transfers, plan changes, receipts | Not needed for the first version. The schema labels the provider so Flutterwave or Stripe can be added. | A new adapter in the billing Worker. |
| Browser-tested Content Security Policy | A nonce-based CSP is set in `apps/web/middleware.ts` (Turnstile, WebRTC, Workers and images allowed; inline theme boot moved to `/theme-boot.js`). Other security headers remain. This has not been clicked through in a real browser with Turnstile and WebRTC on. | Load the app in Chrome/Safari/Firefox with real Worker URLs and confirm nothing is blocked. |

## Left out or changed on purpose
- **Karma and streaks** are private and capped against farming; no notification ever nudges you to keep a streak, and you can hide yours. Nothing is public.
- **Refunds** are started by a finance admin with MFA, never automatically. Policy: within 30 days, takes back the name and the Plus month that payment bought (`refund_window_days`).
- **Push notifications** are deliberately limited and generic; there are no re-engagement messages.

## Where things are
`README.md` (setup) · `00-overview.md` · `01-build-plan.md` (checklist) · `02-architecture.md` · `03-design-system.md` · `04-security.md` · `05-database.md` (every migration) · `06` sharing · `07` identity · `08` random chat · `09` images · `10` admin · `11` AI · `12` billing · `13` **launch checklist** · `14` operations · `15` private chats · `16` image review, scanning, CAPTCHA, legal · `17` audio and video · `18` Android · `19` push · `20` refunds · `21` resonance and streaks · `22` E2EE design · `ENVIRONMENT.md` (every variable and secret).
