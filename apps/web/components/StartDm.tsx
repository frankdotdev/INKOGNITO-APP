'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { dmEnabled, dmService, dmErrorText, DmError } from '../lib/dmClient';
export function StartDm({ type, id, small }: { type: 'post' | 'comment' | 'whisper'; id: string; small?: boolean }) {
  const r = useRouter(); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [needPlus, setNeedPlus] = useState(false);
  if (!dmEnabled) return null;
  const go = async () => { setBusy(true); setErr(''); try { const c = await dmService.start(type, id); r.push(`/messages/dm/${c.id}`); } catch (e) { if (e instanceof DmError && e.code === 'plus_required') setNeedPlus(true); else setErr(dmErrorText(e)); setBusy(false); } };
  return (<><button className={small ? 'act' : 'btn ghost'} disabled={busy} onClick={go}>{busy ? 'Opening…' : 'Message privately'}</button>
    {needPlus && <span className="meta" role="status"> Starting a private chat needs <Link href="/settings/plus" style={{ color: 'var(--accent)' }}>Plus</Link>. Anyone can reply to one.</span>}
    {err && <span className="meta" role="alert" style={{ color: 'var(--danger)' }}> {err}</span>}</>);
}
