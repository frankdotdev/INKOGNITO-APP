'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Comment } from '@inkognito/core';
import { commentService } from '../lib/services';
import { blockService } from '../lib/settingsServices';
import { friendlyError } from '../lib/postService';
import { timeAgo, timeLeft } from '../lib/time';
import { IdentityBadge, EmptyState, Skeleton } from './ui';
import { ReportSheet } from './ReportSheet';
import { ShareButton } from './ShareButton';
import { StartDm } from './StartDm';
export function CommentThread({ postId, enabled, shareable = false }: { postId: string; enabled: boolean; shareable?: boolean }) {
  const [items, setItems] = useState<Comment[] | null>(null); const [err, setErr] = useState(false);
  const [body, setBody] = useState(''); const [fade, setFade] = useState(false); const [parent, setParent] = useState<Comment | null>(null);
  const [busy, setBusy] = useState(false); const [formErr, setFormErr] = useState(''); const [report, setReport] = useState<string | null>(null);
  const load = useCallback(() => commentService.list(postId).then(p => { setItems(p.items); setErr(false); }).catch(() => setErr(true)), [postId]);
  useEffect(() => {
    load();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        commentService.list(postId).then(p => setItems(p.items)).catch(() => {});
      }
    }, 5_000);
    return () => clearInterval(interval);
  }, [load, postId]);
  const send = async () => { setBusy(true); setFormErr(''); try { await commentService.reply(postId, body, parent?.id, fade); setBody(''); setParent(null); await load(); } catch (e) { setFormErr(friendlyError(e)); } setBusy(false); };
  const blockC = async (id: string) => { if (!confirm('Block this person? You will stop seeing their posts, comments and Whispers.')) return; try { await blockService.block({ type: 'comment', id }); await load(); } catch { setFormErr("Couldn't block. Try again."); } };
  const roots = (items ?? []).filter(c => !c.parentId);
  const row = (c: Comment, nested: boolean) => (
    <div key={c.id} className="comment" style={{ marginLeft: nested ? 24 : 0 }}>
      <IdentityBadge who={c.author} meta={timeAgo(c.createdAt) + (c.expiresAt ? ` · fades, ${timeLeft(c.expiresAt)}` : '') + (c.mine ? ' · you' : '')} />
      <p className="body" style={{ fontSize: 16 }}>{c.body}</p>
      <div className="row">{enabled && !nested && <button className="act" onClick={() => setParent(c)}>Reply</button>}{shareable && <ShareButton path={`/c/${c.id}`} title="Share this comment" text={c.body.slice(0, 120)} />}{!c.mine && <button className="act" onClick={() => setReport(c.id)}>Report</button>}{!c.mine && <button className="act" onClick={() => blockC(c.id)}>Block</button>}{!c.mine && <StartDm type="comment" id={c.id} small />}</div>
    </div>);
  return (
    <section aria-label="Comments">
      <h3 className="h">Comments</h3>
      {err ? <EmptyState title="Couldn't load comments" hint="Check your connection and try again." /> : !items ? <Skeleton n={2} /> : items.length === 0 ? <EmptyState title="No comments yet" hint={enabled ? 'Say something kind.' : 'Comments are off for this post.'} /> :
        roots.map(c => <div key={c.id}>{row(c, false)}{items.filter(r => r.parentId === c.id).map(r => row(r, true))}</div>)}
      {enabled && <form onSubmit={e => { e.preventDefault(); send(); }} style={{ display: 'grid', gap: 8, marginTop: 16 }}>
        {parent && <div className="meta">Replying to {parent.author.name} <button type="button" className="act" onClick={() => setParent(null)}>Cancel</button></div>}
        <textarea aria-label="Write a comment" className="field" value={body} onChange={e => setBody(e.target.value)} maxLength={2000} rows={3} />
        <label className="row"><input type="checkbox" checked={fade} onChange={e => setFade(e.target.checked)} /> Fade after 24 hours</label>
        {formErr && <p role="alert" style={{ color: 'var(--danger)' }}>{formErr}</p>}
        <button className="btn" disabled={busy || !body.trim()}>{busy ? 'Sending…' : 'Comment'}</button></form>}
      {report && <ReportSheet target={{ type: 'comment', id: report }} onClose={() => setReport(null)} />}
    </section>
  );
}
