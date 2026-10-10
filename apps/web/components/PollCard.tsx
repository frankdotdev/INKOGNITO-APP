'use client';
import { useState } from 'react';
import type { Post } from '@inkognito/core';
import { reactionService } from '../lib/services';
export function PollCard({ postId, poll }: { postId: string; poll: NonNullable<Post['poll']> }) {
  const [p, setP] = useState(poll); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const vote = async (o: 0 | 1) => { setBusy(true); setErr(''); try { const r = await reactionService.vote(postId, o); setP({ ...p, myVote: r.myVote, votes: r.votes }); } catch { setErr("Your vote didn't go through."); } setBusy(false); };
  const total = p.votes ? p.votes[0] + p.votes[1] : 0;
  return (
    <div className="poll"><div className="name">{p.question}</div>
      {p.options.map((label, i) => { const pct = p.votes && total ? Math.round((p.votes[i] / total) * 100) : 0;
        return <button key={i} className="pollopt" disabled={busy || p.myVote !== undefined} aria-pressed={p.myVote === i} onClick={() => vote(i as 0 | 1)}>
          {p.votes && <span className="fill" style={{ width: pct + '%' }} />}<span className="lbl">{label}</span>{p.votes && <span className="lbl">{pct}%</span>}</button>; })}
      {err && <p role="alert" style={{ color: 'var(--danger)' }}>{err}</p>}
      {p.votes && <div className="meta">{total} {total === 1 ? 'vote' : 'votes'}</div>}
    </div>
  );
}
