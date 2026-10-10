const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 symbols, no look-alikes
export const randomHex = (bytes: number) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), b => b.toString(16).padStart(2, '0')).join('');
export async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, '0')).join('');
}
/** 25 symbols x 5 bits = 125 bits of entropy, shown as XXXXX-XXXXX-XXXXX-XXXXX-XXXXX. */
export function generateRecoveryCode(): string {
  const chars = Array.from(crypto.getRandomValues(new Uint8Array(25)), b => ALPHABET[b & 31]);
  return [0, 5, 10, 15, 20].map(i => chars.slice(i, i + 5).join('')).join('-');
}
export const normalizeRecoveryCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '');
