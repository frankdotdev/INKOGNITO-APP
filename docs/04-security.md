# Security and privacy
- RLS on every exposed table; tests for anon select/insert/update/delete and cross-identity access.
- Never expose: risk scores, moderation notes, device/IP mappings, payment ids, keys, recovery secrets.
- Frontend is never trusted: server derives identity, entitlements, admin status.
- Say "designed to minimize identity data", never "we don't track anything".
- Fading messages are removed after expiry; never promise screenshots are impossible.
- Random audio/video is 18+ at launch, with report/block/next always visible.

## Controls in place
Row-level security forced on every private table; clients reach data only through security-definer functions that return contextual names, never identity ids; admin functions require a non-anonymous session, an enabled admin row, MFA (aal2) and a role, and write an audit entry; third-party keys live only in Workers; every Worker checks origin, authenticates against Supabase and rate-limits; AI and private-chat messages are encrypted before storage; payments are always re-verified with Paystack; uploads are validated by content, stripped of metadata and scanned or held for review; secrets never reach clients.
## Known gaps
Content Security Policy is set (nonce on scripts via middleware; `style-src` still allows inline styles because the UI uses them). It has not been verified in production browsers with Turnstile and WebRTC. The matchmaker's recent-match memory and some rate limits live in Durable Object memory (best effort); feed pagination uses offsets; private chats are not end-to-end encrypted; age confirmation is self-declared; the scanning provider is a general classifier, not hash matching; no automated alerting; no external security review has been done.
