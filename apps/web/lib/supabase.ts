import { createClient } from '@supabase/supabase-js';
import { captchaToken } from './captcha';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy-key';
export const supabase = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
let ready: Promise<void> | null = null;
export const resetSession = () => { ready = null; };
function deviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown OS';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${br} on ${os}`;
}
/** Anonymous sign-in on first use, then make sure the private identity row exists. */
export function ensureSession(): Promise<void> {
  ready ??= (async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) { const { error } = await supabase.auth.signInAnonymously({ options: { captchaToken: await captchaToken() } }); if (error) throw error; }
    const { error } = await supabase.rpc('ensure_identity'); if (error) throw error;
    await supabase.rpc('register_device', { p_label: deviceLabel(), p_platform: 'web' });
  })().catch(e => { ready = null; throw e; });
  return ready;
}
