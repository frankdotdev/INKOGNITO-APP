'use client';
import { useEffect, useRef, useState } from 'react';
import type { LinkOffer } from '@inkognito/core';
import { identityService } from '../../../../../lib/identityService';
import { QrCode } from '../../../../../components/QrCode';
export default function LinkThisDevice() {
  const [offer, setOffer] = useState<LinkOffer | null>(null); const [state, setState] = useState<'idle' | 'waiting' | 'done' | 'expired' | 'has_content' | 'error'>('idle'); const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  useEffect(() => () => timer.current && clearInterval(timer.current), []);
  const start = async () => {
    setState('waiting');
    try {
      const o = await identityService.startLink(window.location.origin); setOffer(o);
      timer.current = setInterval(async () => {
        try {
          const st = await identityService.linkStatus(o.pairingId);
          if (st === 'approved') { timer.current && clearInterval(timer.current); const r = await identityService.finishLink(o); if (r === 'ok') { setState('done'); setTimeout(() => (window.location.href = '/void'), 1200); } else setState(r === 'device_has_content' ? 'has_content' : 'expired'); }
          else if (st === 'expired' || st === 'invalid') { timer.current && clearInterval(timer.current); setState('expired'); }
        } catch { timer.current && clearInterval(timer.current); setState('error'); }
      }, 2000);
    } catch { setState('error'); }
  };
  const copy = async () => { if (!offer) return; try { await navigator.clipboard.writeText(offer.url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { window.prompt('Copy this link', offer.url); } };
  return (<div style={{ display: 'grid', gap: 16, justifyItems: 'start' }}><h1 style={{ fontSize: 28, letterSpacing: '-.02em' }}>Use an existing identity here</h1>
    <p className="meta">On your other device, scan this code with its camera, open the link, and approve. The code works once and expires in 5 minutes. If this device has posts of its own, it can't be linked; purge it first.</p>
    {state === 'idle' && <button className="btn" onClick={start}>Show link code</button>}
    {state === 'waiting' && offer && <><QrCode value={offer.url} label="Link code" /><button className="btn ghost" onClick={copy}>{copied ? 'Link copied' : 'Copy link instead'}</button><p className="meta" role="status">Waiting for your other device…</p></>}
    {state === 'done' && <p role="status" className="name">Linked. Taking you to your Void…</p>}
    {state === 'expired' && <><p role="alert" style={{ color: 'var(--danger)' }}>The code expired or was rejected.</p><button className="btn" onClick={start}>Try again</button></>}
    {state === 'has_content' && <p role="alert" style={{ color: 'var(--danger)' }}>This device already has its own posts, so it can't be linked. Purge this device first (Settings, Identity, Purge or delete), then try again.</p>}
    {state === 'error' && <><p role="alert" style={{ color: 'var(--danger)' }}>Something went wrong. Check your connection.</p><button className="btn" onClick={start}>Try again</button></>}
  </div>);
}
