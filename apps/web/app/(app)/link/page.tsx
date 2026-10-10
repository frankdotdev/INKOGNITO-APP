'use client';
import { use, useState } from 'react';
import { identityService } from '../../../lib/identityService';
import { EmptyState } from '../../../components/ui';
export default function Approve({ searchParams }: { searchParams: Promise<{ p?: string; c?: string }> }) {
  const { p, c } = use(searchParams); const [state, setState] = useState<'ask' | 'busy' | 'ok' | 'expired' | 'invalid' | 'error'>('ask');
  if (!p || !c) return <EmptyState title="This link is incomplete" hint="Scan the code on your new device again." />;
  const approve = async () => { setState('busy'); try { const r = await identityService.approveLink(p, c); setState(r === 'ok' ? 'ok' : r === 'expired' ? 'expired' : 'invalid'); } catch { setState('error'); } };
  return (<div style={{ display: 'grid', gap: 16, justifyItems: 'start' }}><h1 style={{ fontSize: 28, letterSpacing: '-.02em' }}>Add a new device?</h1>
    {state === 'ask' || state === 'busy' ? <><p className="meta">Only approve this if you just opened Inkognito on a device of your own and it is showing this code. Approving gives that device access to your posts and Whispers.</p>
      <div className="row"><a className="btn ghost" href="/void" style={{ display: 'flex', alignItems: 'center' }}>Cancel</a><button className="btn" disabled={state === 'busy'} onClick={approve}>{state === 'busy' ? 'Approving…' : 'Approve device'}</button></div></>
      : state === 'ok' ? <p role="status">Approved. Your new device will finish linking in a moment.</p>
      : state === 'expired' ? <p role="alert" style={{ color: 'var(--danger)' }}>This code expired. Show a new one on the new device.</p>
      : state === 'invalid' ? <p role="alert" style={{ color: 'var(--danger)' }}>This code isn't valid, was already used, or was too many wrong tries.</p>
      : <p role="alert" style={{ color: 'var(--danger)' }}>Couldn't reach Inkognito. Try again.</p>}
  </div>);
}
