# Sharing
- Every post and comment has a Share button. It opens the phone's share sheet, or copies the link on desktop.
- Post links look like `/s/<id>`, comment links `/c/<id>`. Pasted into WhatsApp, Telegram, iMessage, Slack, X and similar, they unfurl into a dark card that contains the text and the contextual name (1200x630, `opengraph-image.tsx`).
- Opening a link shows the same card plus "Join the conversation", which goes to `/post/<id>` and signs the visitor in anonymously. No account needed.
- Authors control it: "Let people share this as a link" in the composer (default on), and "Turn sharing off/on" in the post menu.
- Public reads use two functions the `anon` role may call: `get_public_post` and `get_public_comment`. They return nothing for deleted, expired, moderated or unshareable content, and never return identity ids.
- Share pages are `noindex` (not for search engines). To allow indexing later, change `robots` in `app/s/[id]/page.tsx` and `app/c/[id]/page.tsx`.
- Set `NEXT_PUBLIC_SITE_URL` to the real domain so preview images resolve.
- Known limits: the preview image uses the default font, so some scripts and emoji may not render in the image. Previews are cached by the platforms that fetch them, so a deleted post can still show a cached preview for a while.
