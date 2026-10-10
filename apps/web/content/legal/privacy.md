# Privacy Policy

Last updated: 9 October 2026

This policy describes how Inkognito handles information. It is written to match how the product actually works. Have a lawyer review it for the places you operate, including any required local disclosures, before public launch. Replace the operator contact at the end.

The in-app Privacy page is a short summary. This document is the policy.

## What Inkognito is

Inkognito is an anonymous social service. You do not need a real name, email address or phone number to take part. Other people see a generated name that changes from thread to thread, or a name you have bought, not a public profile.

We still process some information so the service can run and so we can stop abuse. We collect the minimum we can. We do not sell your information.

## Information we process

**Anonymous identity.** A server-side identity tied to your signed-in session (an anonymous account). It lets us show your posts to you, enforce rules, apply limits and offer Plus. Other users never see this identifier.

**Content you provide.** Posts, comments, polls, reactions, Echoes, bookmarks, Whispers, reports, private messages, AI companion messages, images you upload, and settings (for example appearance and notification choices on this device).

**Device and session data.** A device label (browser and operating system), a device record for linking and revocation, and technical data such as IP address and security tokens. We use this to keep you signed in, link or recover devices, rate-limit abuse and protect the service. We do not use it to build a public profile.

**Payments.** If you buy a name or Plus, our payment provider (Paystack) processes the payment. We store order references, plan, currency, amount, status and whether a refund was made. We do not store your full card number. Billing is kept separate from the name other people see.

**Safety and moderation.** Reports, blocks, image-review decisions, automated image-scan outcomes (not the image pixels in the admin log beyond what moderators need), and a flag that an AI crisis-style event occurred — never the text of that AI message. Moderators with MFA and a role can act on queues. Actions are written to an audit log.

**Notifications.** If you enable push notifications we store a push subscription for this device. Notification bodies are generic; they do not include the text of posts or messages.

## Information we do not ask for

We do not require your legal name, email, phone number, contacts, precise location or government ID for ordinary use. Age for audio and video is a self-declared confirmation that you are 18 or older, not an identity check.

## How we use information

- Provide the service you asked for (feeds, chat, AI replies, payments, device linking)
- Enforce community rules, hold image posts for review, and respond to reports
- Secure the service (rate limits, CAPTCHA when configured, fraud and abuse prevention)
- Operate Plus, names and refunds
- Meet legal duties, including preserving and reporting child sexual abuse material where required

We do not use your content to advertise to you. We do not send re-engagement push notifications.

## Sharing with others

**Other people on Inkognito** see the content you post or send them, with a contextual name, not your identity id. Share links you allow can be opened by anyone with the link. Share pages are not offered to search engines.

**Service providers** process information on our instructions:

- Hosting and database (Supabase / PostgreSQL)
- Edge compute, storage and, when enabled, Cloudflare's child-safety scanning on uploaded media (Cloudflare)
- Payments (Paystack)
- AI replies (Groq; Google Gemini if Groq fails)
- Automated image moderation, when enabled (OpenAI). Image bytes are sent to that provider. Say no to images if you do not want that.

Providers have their own terms. We do not sell personal information.

**Authorities.** We may disclose information when the law requires it or to protect someone from serious harm, including reports of child sexual abuse material.

## Encryption and retention

Private chats and AI companion history are encrypted before they are stored. They are **not end-to-end encrypted**: people who operate the service can decrypt them. We do that for private chats only when a chat is reported (a short recent window). AI history is not available to moderators as conversation text.

Typical retention (these periods can be configured by the operator):

- Whispers: 24 hours
- Fading posts and comments: until the expiry you chose
- Private chats and AI history: 90 days, or sooner if you delete them or your identity
- Images that are rejected, expire or are removed: deleted from storage
- Random chat: no lasting message history; a short window only while the room is open, for reports
- Reports, blocks, orders, refunds and admin audit records: kept as needed for safety, finance and legal duties

Backups, if enabled, may hold copies until they rotate.

If encryption keys for AI or private chat storage are lost, that stored history becomes unreadable.

## Your choices

- Delete your content (posts, comments, and your reactions, Echoes, saves, votes and sent Whispers) without deleting your identity
- Delete your identity, which also deletes companion history and signs this device out
- Purge this device, revoke other devices, or set a recovery code
- Turn push notifications off
- Block people
- Decline images, Plus, private chats, random chat and the AI companion; those features only appear when they are configured

Depending on where you live you may have rights to access, correct, delete or export information, or to object to certain processing. Use the in-app tools first. For a request we cannot complete in-app, use the contact details below. We may need to refuse a request that would identify another anonymous user or undermine an investigation.

## Children

Inkognito is not directed at children under 16. We do not knowingly allow sexual or exploitative content involving anyone under 18. Images may be held for human review and, when configured, checked by automated classifiers and by Cloudflare's CSAM tools. Automated classifiers miss things. Hash-based matching of known abuse images depends on tools the operator enables outside this app.

## International processing

The service is provided over the internet. Information may be processed in the countries where our providers operate, which may not be where you live.

## Changes

We may update this policy. The date at the top will change. Continued use after that date means you accept the update.

## Contact

For privacy inquiries, data requests, or compliance matters:

- Privacy Officer: privacy@inkognito.app
- Content & Safety: Use the in-app **Report** feature on any post or message.
- Identity & Data Removal: You can purge your device or delete your entire identity and content directly in **Settings → Identity**.

