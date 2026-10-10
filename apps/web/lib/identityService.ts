import type { IdentityService } from '@inkognito/core';
import { supabase, ensureSession, resetSession } from './supabase';
import { rpc } from './postService';
import { disablePush } from './pushClient';
import { generateRecoveryCode, normalizeRecoveryCode, randomHex, sha256Hex } from './recoveryCode';
/** Wipes everything on this device except appearance choices, then signs out. */
const markOnboarded = () => { try { localStorage.setItem('ink-onboarded', '1'); } catch {} };
async function clearThisDevice() {
  await supabase.auth.signOut();
  const keep = ['ink-theme', 'ink-motion'].map(k => [k, localStorage.getItem(k)] as const);
  localStorage.clear(); sessionStorage.clear();
  keep.forEach(([k, v]) => v !== null && localStorage.setItem(k, v));
  try { const dbs = (await indexedDB.databases?.()) ?? []; dbs.forEach(d => d.name && indexedDB.deleteDatabase(d.name)); } catch {}
  try { for (const k of await caches.keys()) await caches.delete(k); } catch {} // page copies from the service worker
  resetSession();
}
export const identityService: IdentityService = {
  ensureIdentity: ensureSession,
  async summary() { const [r] = await rpc<any[]>('identity_summary'); return { createdAt: r.created_at, deviceCount: r.device_count, hasRecovery: r.has_recovery, recoveryCreatedAt: r.recovery_created_at ?? undefined }; },
  async listDevices() { const rows = await rpc<any[]>('list_devices'); return rows.map(r => ({ id: r.id, label: r.label, platform: r.platform ?? undefined, createdAt: r.created_at, lastSeenAt: r.last_seen_at, current: r.is_current })); },
  async revokeDevice(id) { await rpc('revoke_device', { p_id: id }); },
  async startLink(siteUrl) {
    const code = randomHex(16);
    const [r] = await rpc<any[]>('create_pairing', { p_code_hash: await sha256Hex(code) });
    return { pairingId: r.id, code, url: `${siteUrl}/link?p=${r.id}&c=${code}`, expiresAt: r.expires_at };
  },
  linkStatus: id => rpc('pairing_status', { p_id: id }),
  async finishLink(o) { const r = await rpc<any>('complete_pairing', { p_id: o.pairingId, p_code: o.code }); if (r === 'ok') markOnboarded(); return r; },
  approveLink: (id, code) => rpc('approve_pairing', { p_id: id, p_code: code }),
  async createRecoveryCode() { const code = generateRecoveryCode(); await rpc('set_recovery', { p_hash: await sha256Hex(normalizeRecoveryCode(code)) }); return code; },
  async recover(code) { const r = await rpc<any>('recover_identity', { p_hash: await sha256Hex(normalizeRecoveryCode(code)) }); if (r === 'ok') markOnboarded(); return r; },
  async purgeThisDevice() { await disablePush(); await rpc('purge_this_device'); await clearThisDevice(); },
  async deleteIdentity() { await disablePush(); await rpc('delete_identity'); await clearThisDevice(); },
};
