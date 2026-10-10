'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, EyeOff, Flag, Ban, Clock, ShieldCheck } from 'lucide-react';
import { identityService } from '../../lib/identityService';
type Step = 'welcome' | 'how' | 'privacy' | 'identity' | 'safety';
const dotIndex: Record<Step, number> = { welcome: 0, how: 0, privacy: 1, identity: 2, safety: 3 };
function IdentityStep({ onNext }: { onNext: () => void }) {
  const [state, setState] = useState<'working' | 'ready' | 'error'>('working');
  const run = () => { setState('working'); identityService.ensureIdentity().then(() => setState('ready')).catch(() => setState('error')); };
  useEffect(() => { run(); }, []);
  return (<>
    <h1 className="ob-hero">{state === 'ready' ? 'Your place in the Void is ready.' : state === 'error' ? "We couldn't set things up." : 'Setting up your place…'}</h1>
    {state === 'ready' && <p className="ob-sub">Your name changes depending on where you speak, so no one can follow you from one thread to the next. Nobody sees a profile, a photo or a follower count.</p>}
    {state === 'error' && <p className="ob-sub" role="alert">Check your connection and try again.</p>}
    <div className="ob-actions">
      {state === 'ready' && <><button className="btn" onClick={onNext}>Continue</button><Link className="ob-link" href="/settings/identity/recovery">Set up a recovery code</Link></>}
      {state === 'error' && <button className="btn" onClick={run}>Try again</button>}
    </div></>);
}
export default function Welcome() {
  const r = useRouter(); const [stack, setStack] = useState<Step[]>(['welcome']); const step = stack[stack.length - 1];
  const go = (s: Step) => setStack(x => [...x, s]); const back = () => setStack(x => (x.length > 1 ? x.slice(0, -1) : x));
  const finish = () => { try { localStorage.setItem('ink-onboarded', '1'); } catch {} r.replace('/void'); };
  return (
    <main className="ob">
      <div className="ob-top">{stack.length > 1 ? <button className="act" onClick={back} aria-label="Back"><ArrowLeft size={20} /></button> : <span style={{ width: 44 }} />}
        <div className="dots" role="img" aria-label={`Step ${dotIndex[step] + 1} of 4`}>{[0, 1, 2, 3].map(i => <i key={i} className={i <= dotIndex[step] ? 'on' : ''} />)}</div><span style={{ width: 44 }} /></div>
      <div className="ob-body" key={step}>
        {step === 'welcome' && <>
          <div className="wordmark" style={{ padding: 0 }}>inkognito</div>
          <h1 className="ob-hero">Say what you can't say anywhere else.</h1>
          <p className="ob-sub">No account. No followers. No real name required.</p>
          <div className="ob-actions"><button className="btn" onClick={() => go('privacy')}>Enter the Void</button>
            <button className="btn ghost" onClick={() => go('how')}>How Inkognito works</button>
            <Link className="ob-link" href="/settings/identity/link">Continue existing Inkognito</Link></div>
          {(process.env.NEXT_PUBLIC_HAS_TERMS || process.env.NEXT_PUBLIC_HAS_PRIVACY_POLICY) && <p className="meta" style={{ textAlign: 'center' }}>By continuing you agree to our {process.env.NEXT_PUBLIC_HAS_TERMS && <Link className="ob-link" style={{ display: 'inline' }} href="/legal/terms">Terms</Link>}{process.env.NEXT_PUBLIC_HAS_TERMS && process.env.NEXT_PUBLIC_HAS_PRIVACY_POLICY && ' and '}{process.env.NEXT_PUBLIC_HAS_PRIVACY_POLICY && <Link className="ob-link" style={{ display: 'inline' }} href="/legal/privacy">Privacy Policy</Link>}.</p>}</>}
        {step === 'how' && <>
          <h1 className="ob-hero">How it works</h1>
          <div className="ob-cards">{[['01', 'You arrive anonymously.'], ['02', 'You speak freely.'], ['03', 'You leave without carrying a public identity.']].map(([n, t]) => <div className="card" key={n}><div className="meta">{n}</div><div className="name" style={{ fontSize: 20, marginTop: 4 }}>{t}</div></div>)}</div>
          <div className="ob-actions"><button className="btn" onClick={() => go('privacy')}>Enter the Void</button></div></>}
        {step === 'privacy' && <>
          <h1 className="ob-hero">Private by design.</h1>
          <ul className="ob-list">
            <li><EyeOff size={20} /><span>No real name, email or phone number needed.</span></li>
            <li><ShieldCheck size={20} /><span>No public profile. Each thread gives you a different generated name.</span></li>
            <li><Clock size={20} /><span>Your identity stays with you. Link more devices, or set a recovery code, whenever you like.</span></li>
          </ul>
          <p className="ob-sub">We still handle technical data, like network addresses, to stop abuse. We collect the minimum we can.</p>
          <div className="ob-actions"><button className="btn" onClick={() => go('identity')}>Continue</button></div></>}
        {step === 'identity' && <IdentityStep onNext={() => go('safety')} />}
        {step === 'safety' && <>
          <h1 className="ob-hero">Anonymous doesn't mean anything goes.</h1>
          <ul className="ob-list">
            <li><Flag size={20} /><span>Report anything that breaks the rules, on any post, comment or Whisper.</span></li>
            <li><Ban size={20} /><span>Block anyone. They aren't told, and you stop seeing them.</span></li>
            <li><Clock size={20} /><span>Fading messages are removed after they expire, but anyone could still have taken a screenshot.</span></li>
          </ul>
          <p className="ob-sub">If someone is in danger, contact your local emergency services. Read the <Link className="ob-link" style={{ display: 'inline' }} href="/settings/rules">community rules</Link>.</p>
          <div className="ob-actions"><button className="btn" onClick={finish}>I understand</button></div></>}
      </div>
    </main>
  );
}
