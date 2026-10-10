'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Whisper } from '@inkognito/core';
import { EmptyState, IdentityBadge, Skeleton, ago, fadesIn } from '../../../components/ui';
import { ReportSheet } from '../../../components/ReportSheet';
import { messageService } from '../../../lib/socialServices';
import { MessagesTabs } from '../../../components/MessagesTabs';
import { StartDm } from '../../../components/StartDm';
import { blockService } from '../../../lib/settingsServices';
export default function Whispers() {
  const [items, setItems] = useState<Whisper[] | null>(null); const [err, setErr] = useState(false); const [report, setReport] = useState<string | null>(null); const [msg, setMsg] = useState('');
  const load = () => messageService.listWhispers().then(r => setItems(r.items)).catch(() => setErr(true));
  useEffect(() => { load(); }, []);
  const block = async (id: string) => { if (!confirm('Block this person? You will stop seeing their posts, comments and Whispers.')) return; try { await blockService.block({ type: 'whisper', id }); await load(); } catch { setMsg("Couldn't block. Try again."); } };
  if (err) return <EmptyState title="Couldn't load whispers" hint="Check your connection and try again." />;
  if (!items) return <Skeleton n={2} />;
  if (!items.length) return <EmptyState title="No whispers" hint="Private replies to your confessions show up here, and fade after 24 hours." />;
  return <><MessagesTabs />{msg && <p role="alert" style={{ color: 'var(--danger)' }}>{msg}</p>}{items.map(w => (
    <div key={w.id} className="card">
      <Link href={`/post/${w.postId}`} style={{ display: 'block' }}>
        <IdentityBadge who={w.from} meta={[w.mine ? 'You sent this' : 'Sent to you', ago(w.createdAt), fadesIn(w.expiresAt)].filter(Boolean).join(' · ')} />
        <p style={{ marginTop: 12, lineHeight: 1.5 }}>{w.body}</p></Link>
      {!w.mine && <div className="row"><button className="act" onClick={() => setReport(w.id)}>Report</button><button className="act" onClick={() => block(w.id)}>Block</button><StartDm type="whisper" id={w.id} small /></div>}
    </div>))}
    {report && <ReportSheet target={{ type: 'whisper', id: report }} onClose={() => setReport(null)} />}</>;
}
