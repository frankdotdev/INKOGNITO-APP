# End-to-end encrypted private chats: design (NOT BUILT)
Today private chats are encrypted at rest by the DM Worker, which can decrypt them. This is the plan for real end-to-end encryption. Nothing below exists in code.

## Goals and honest limits
Only the two people's devices can read messages; a database leak, an admin, or a compromised Worker learns nothing. **Not** goals: forward secrecy (a stolen key reveals that chat's history), protection from a malicious server swapping public keys (mitigated only by showing a safety number people may compare), or recovering history after losing every device without a recovery code.

## Keys
- Each identity has one **DM key pair** (ECDH P-256), generated on the first device when the identity is created, so it exists before any recovery code does. The public key and a key id are uploaded (`set_dm_key`); the private key stays on devices (IndexedDB).
- **Conversation key:** `HKDF(ECDH(my_private, peer_public), salt = conversation id, info = "inkognito-dm-v1")` gives an AES-256-GCM key both sides can derive.
- **Message format:** `{v:1, from: senderKeyId, to: recipientKeyId, n: nonce, c: ciphertext}`, stored as the existing `content_enc`. A message whose key ids don't match the device's key shows "can't be read on this device".

## Moving the key between devices
- **Linking:** the QR link already carries a one-time code. Add a second secret `k` in the URL **fragment** (never sent to any server). The approving device encrypts the DM private key with a key derived from `k` and uploads the blob (`put_pairing_blob`); the new device downloads it after completing the pairing and decrypts with `k`. The server never sees `k` or the key.
- **Recovery:** when the recovery code is created, the DM private key is also encrypted with a key derived from the code (HKDF with a fixed salt) and stored as an opaque backup (`set_dm_backup`). Recovering on a new device downloads the backup and decrypts it with the code.
- **No recovery code, all devices lost:** chat history is gone. The new identity gets a new key pair.

## Server changes
New tables `dm_keys`, `dm_key_backups`, `pairing_blobs`; functions `set_dm_key`, `get_peer_key` (service, returns the other participant's public key and id for a conversation), `set_dm_backup`/`get_dm_backup`, `put_pairing_blob`/`get_pairing_blob` (deleted after fetch or expiry). The DM Worker stops encrypting and decrypting: it stores and returns ciphertext, still enforcing Plus, blocks, limits and membership. Existing server-encrypted messages are deleted by the migration (acceptable only before launch).

## Reports
The server can no longer read messages, so the **reporting client** decrypts the last 20 and submits them. Moderators see them labelled "submitted by the reporter, unverified". This is weaker evidence than today and a real trade-off of E2EE.

## Client changes
A crypto module (`apps/web/lib/e2ee.ts`); key creation in `ensureSession`; linking and recovery pages handle the blob and backup; the chat list and thread decrypt and encrypt locally; list previews are decrypted on the device; a "safety number" screen shows both keys' fingerprints.

## How to test
Pure crypto (key agreement, encrypt/decrypt, tamper detection, wrong key, backup and pairing wrap) runs in Node 22 with WebCrypto and can be fully automated. SQL tests cover the new functions. **The browser integration (IndexedDB, linking, recovery) can only be verified on real devices.**
