# Architecture
```
Web / Mobile -> features -> services -> repositories -> Supabase (later: NestJS API)
Realtime random chat: client -> Worker -> Durable Object (WebSocket). Media: WebRTC. Files: R2 via signed URLs.
```
- Postgres holds durable state only. No typing, presence, matchmaking or signaling in Postgres.
- Feed reads are plain HTTP; Supabase Realtime only for notifications.
- Entitlements are checked through `EntitlementService`, never `if (premium)`.
- Billing identity stays fully separate from public identity.
- Never ship the service-role key, AI keys or private keys to a client.
