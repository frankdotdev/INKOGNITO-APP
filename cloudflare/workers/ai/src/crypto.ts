import type { Env } from './env';
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
let cached: { raw: string; key: CryptoKey } | null = null;
async function key(env: Env): Promise<CryptoKey> {
  if (cached?.raw === env.AI_DATA_KEY) return cached.key;
  const raw = unb64(env.AI_DATA_KEY); if (raw.length !== 32) throw new Error('AI_DATA_KEY must be 32 bytes, base64');
  const k = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']); cached = { raw: env.AI_DATA_KEY, key: k }; return k;
}
/** AES-256-GCM with a fresh random nonce. Output: base64(nonce || ciphertext). */
export async function encrypt(env: Env, text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(env), new TextEncoder().encode(text)));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return b64(out);
}
export async function decrypt(env: Env, enc: string): Promise<string> {
  const all = unb64(enc);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, await key(env), all.slice(12)));
}
