'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Heart, MessageCircle, Repeat2, Bookmark, MoreHorizontal, Flag, Trash2, Ban, Share2 } from 'lucide-react';
import type { Post } from '@inkognito/core';
import { IdentityBadge, MoodBadge } from './ui';
import { PollCard } from './PollCard';
import { ReportSheet } from './ReportSheet';
import { ShareCardModal } from './ShareCardModal';
import { reactionService } from '../lib/services';
import { postService } from '../lib/postService';
import { blockService } from '../lib/settingsServices';
import { timeAgo, timeLeft } from '../lib/time';
export function ConfessionCard({ post, detail = false, onRemoved }: { post: Post; detail?: boolean; onRemoved?: () => void }) {
  const [s, setS] = useState({ reacted: post.reacted, reactions: post.counts.reactions, echoed: post.echoed, echoes: post.counts.echoes, saved: post.saved });
  const [sharing, setSharing] = useState(post.shareable);
  const [cardModal, setCardModal] = useState(false);
  const [menu, setMenu] = useState(false); const [report, setReport] = useState(false); const [err, setErr] = useState('');
  const act = async (next: typeof s, call: () => Promise<unknown>) => { const prev = s; setS(next); setErr(''); try { await call(); } catch { setS(prev); setErr("That didn't go through. Try again."); } };
  const remove = async () => { if (!confirm("Let this disappear? This can't be undone.")) return; try { await postService.remove(post.id); onRemoved?.(); } catch { setErr("Couldn't remove it. Try again."); } setMenu(false); };
  const toggleSharing = async () => { setMenu(false); try { await postService.setSharing(post.id, !sharing); setSharing(!sharing); } catch { setErr("Couldn't change sharing. Try again."); } };
  const block = async () => { setMenu(false); if (!confirm('Block this person? You will stop seeing their posts, comments and Whispers.')) return; try { await blockService.block({ type: 'post', id: post.id }); onRemoved?.(); } catch { setErr("Couldn't block. Try again."); } };
  const body = <p className="body">{post.body}</p>;
  return (
    <article className="card">
      <div className="row"><IdentityBadge who={post.author} meta={timeAgo(post.createdAt) + (post.category ? ` · ${post.category}` : '')} /><span className="grow" />
        {post.mood && <MoodBadge mood={post.mood} />}
        <div className="menuwrap"><button className="act" aria-label="More actions" aria-expanded={menu} onClick={() => setMenu(!menu)}><MoreHorizontal size={20} /></button>
          {menu && <div className="menu">{!post.mine && <button className="act" onClick={() => { setMenu(false); setReport(true); }}><Flag size={18} />Report</button>}
            {!post.mine && <button className="act" onClick={block}><Ban size={18} />Block</button>}
            {post.mine && <button className="act" onClick={toggleSharing}><Share2 size={18} />{sharing ? 'Turn sharing off' : 'Turn sharing on'}</button>}
            {post.mine && <button className="act" onClick={remove}><Trash2 size={18} />Let it disappear</button>}</div>}</div></div>
      {detail ? body : <Link href={`/post/${post.id}`}>{body}</Link>}
      {post.media.length > 0 && <div style={{ display: 'grid', gap: 8, gridTemplateColumns: post.media.length > 1 ? 'repeat(2, 1fr)' : '1fr', marginBottom: 16 }}>
        {post.media.map(m => <img key={m.url} src={m.url} width={m.width} height={m.height} loading="lazy" alt="Image attached to this confession" style={{ width: '100%', height: 'auto', maxHeight: 480, objectFit: 'cover', borderRadius: 12, background: 'var(--surface-raised)' }} />)}</div>}
      {post.poll && <PollCard postId={post.id} poll={post.poll} />}
      <div className="row">
        <button className="act" aria-pressed={s.reacted} aria-label="React" onClick={() => act({ ...s, reacted: !s.reacted, reactions: s.reactions + (s.reacted ? -1 : 1) }, () => reactionService.react({ type: 'post', id: post.id }, 'heart'))}><Heart size={20} />{s.reactions}</button>
        {detail ? <span className="act"><MessageCircle size={20} />{post.counts.comments}</span> : <Link className="act" href={`/post/${post.id}`} aria-label="Comments"><MessageCircle size={20} />{post.counts.comments}</Link>}
        <button className="act" aria-pressed={s.echoed} aria-label="Echo" onClick={() => act({ ...s, echoed: !s.echoed, echoes: s.echoes + (s.echoed ? -1 : 1) }, () => reactionService.echo(post.id, !s.echoed))}><Repeat2 size={20} />{s.echoes}</button>
        <span className="grow" />
        {sharing && <button className="act" aria-label="Share as Visual Card" onClick={() => setCardModal(true)}><Share2 size={20} /></button>}
        <button className="act" aria-pressed={s.saved} aria-label="Save" onClick={() => act({ ...s, saved: !s.saved }, () => reactionService.bookmark(post.id, !s.saved))}><Bookmark size={20} /></button>
      </div>
      {err && <p role="alert" className="meta" style={{ color: 'var(--danger)' }}>{err}</p>}
      {report && <ReportSheet target={{ type: 'post', id: post.id }} onClose={() => setReport(false)} />}
      {cardModal && <ShareCardModal post={post} onClose={() => setCardModal(false)} />}
    </article>
  );
}
