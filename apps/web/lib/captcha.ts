const KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
declare global { interface Window { turnstile?: any } }
let script: Promise<void> | null = null;
function load(): Promise<void> {
  script ??= new Promise<void>((res, rej) => {
    if (window.turnstile) { res(); return; }
    const s = document.createElement('script'); s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.async = true;
    s.onload = () => res(); s.onerror = () => { script = null; rej(new Error('captcha_load')); }; document.head.appendChild(s);
  });
  return script;
}
/** Returns a one-time Cloudflare Turnstile token, or undefined when CAPTCHA is not configured. Shows a challenge only if Cloudflare asks for one. */
export async function captchaToken(): Promise<string | undefined> {
  if (!KEY) return undefined;
  await load();
  return new Promise<string>((resolve, reject) => {
    const box = document.createElement('div'); box.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:100'; document.body.appendChild(box);
    let id: string | undefined;
    const done = (f: () => void) => { try { if (id) window.turnstile.remove(id); } catch {} box.remove(); f(); };
    const timer = setTimeout(() => done(() => reject(new Error('captcha_timeout'))), 60_000);
    id = window.turnstile.render(box, { sitekey: KEY, appearance: 'interaction-only', callback: (t: string) => { clearTimeout(timer); done(() => resolve(t)); }, 'error-callback': () => { clearTimeout(timer); done(() => reject(new Error('captcha_failed'))); } });
  });
}
