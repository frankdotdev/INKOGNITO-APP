'use client';
import { useEffect, useState } from 'react';
export function ConnectionBanner() {
  const [state, setState] = useState<'online' | 'offline' | 'back'>('online');
  useEffect(() => {
    if (!navigator.onLine) setState('offline');
    let t: ReturnType<typeof setTimeout>;
    const off = () => setState('offline'); const on = () => { setState('back'); t = setTimeout(() => setState('online'), 3000); };
    window.addEventListener('offline', off); window.addEventListener('online', on);
    return () => { window.removeEventListener('offline', off); window.removeEventListener('online', on); clearTimeout(t); };
  }, []);
  if (state === 'online') return null;
  return state === 'offline' ? <div className="banner warn" role="status">You're offline. Nothing you do will be sent until you're back online.</div> : <div className="banner ok" role="status">Back online.</div>;
}
