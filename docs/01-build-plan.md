# Build plan and status
"Built" means written, automatically tested where possible here, and documented. Nothing has been run against real services or devices (see `STATUS.md`).

## Built
- [x] Foundation, shared types, 7 themes, responsive shell, offline shell, installable PWA
- [x] Onboarding; the Void; composer with images, polls, fading, drafts; comments; reactions; Echoes; bookmarks; Whispers; reports; blocks
- [x] Discover, search (posts and names), Take Me Somewhere, My Inkognito, share cards
- [x] Identity: sign-in, linking, recovery, devices, purge, delete
- [x] Random chat: text; audio and video (off by default)
- [x] Private chats (encrypted at rest)
- [x] AI companion
- [x] Plus and lifetime names, Paystack payments, refunds
- [x] Image upload, review queue, optional automated scanning
- [x] Admin Control Room (MFA, roles, queues, orders and refunds, scans, audit)
- [x] Push notifications; private resonance and streaks
- [x] CI, test runners, runbooks, launch checklist
- [x] Draft Terms and Privacy Policy (lawyer review and operator contact still required)
- [x] Content Security Policy (nonce middleware; confirm in real browsers)

## Not built (see `STATUS.md` for why and what it takes)
- [ ] End-to-end encrypted private chats (designed: `22-e2ee-design.md`)
- [ ] Native Android app (web app installs; Play wrapper documented: `18-android.md`)
- [ ] Hash-based child-safety scanning, real age verification, moderator staffing
- [ ] Other payment providers
- [ ] Browser, device and real-service testing; load and accessibility testing
