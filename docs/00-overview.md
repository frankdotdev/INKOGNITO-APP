# Overview
- **Product:** anonymous confessions, comments, Echoes, polls, Whispers, random chat, private chats, an AI companion, claimed names (for life) and Plus. No accounts, followers or public profiles.
- **Identity:** an anonymous identity lives server-side, devices are sessions on it, and every thread shows a different generated name (or the owner's `@name`). See `07-identity.md`.
- **Rule:** the database is the security boundary (row-level security, security-definer functions, MFA-gated admin). Workers hold third-party keys. Clients are never trusted.

**For the real state of the project, what is tested, and what is not built, read `STATUS.md`.**
