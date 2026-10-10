import { rpc } from './postService';
const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
export const pushConfigured = !!KEY;
export type PushState = 'unconfigured' | 'unsupported' | 'denied' | 'off' | 'on';
export type NotificationPrefs = { replies: boolean; whispers: boolean; messages: boolean; activity: boolean };
const toBytes = (b64u: string) => Uint8Array.from(atob(b64u.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64u.length % 4)) % 4)), c => c.charCodeAt(0));
export async function pushState(): Promise<PushState> {
  if (!KEY) return 'unconfigured';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration(); return (await reg?.pushManager.getSubscription()) ? 'on' : 'off';
}
export async function enablePush(): Promise<PushState> {
  if (!KEY) return 'unconfigured';
  const perm = await Notification.requestPermission(); if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(KEY) });
  const j = sub.toJSON(); if (!j.endpoint || !j.keys?.p256dh || !j.keys.auth) throw new Error('subscription');
  try { await rpc('push_subscribe', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth }); } catch (e) { await sub.unsubscribe(); throw e; }
  return 'on';
}
/** Removes this device from push. Safe to call when nothing is subscribed. Call it before purging a device, while the session still exists. */
export async function disablePush(): Promise<void> {
  try { const reg = await navigator.serviceWorker?.getRegistration(); const sub = await reg?.pushManager.getSubscription(); if (!sub) return; await rpc('push_unsubscribe', { p_endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); } catch {}
}
export const getPrefs = () => rpc<NotificationPrefs>('get_notification_prefs');
export const setPrefs = (p: NotificationPrefs) => rpc<void>('set_notification_prefs', { p_replies: p.replies, p_whispers: p.whispers, p_messages: p.messages, p_activity: p.activity });
