'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
/** Splash, then first-timers go to onboarding and returning people go straight to the Void. */
export default function Splash() {
  const r = useRouter();
  useEffect(() => {
    let done = false; try { done = localStorage.getItem('ink-onboarded') === '1'; } catch {}
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduce';
    const t = setTimeout(() => r.replace(done ? '/void' : '/welcome'), reduce ? 0 : done ? 300 : 1100);
    return () => clearTimeout(t);
  }, [r]);
  return <div className="splash"><div className="splash-mark">inkognito</div></div>;
}
