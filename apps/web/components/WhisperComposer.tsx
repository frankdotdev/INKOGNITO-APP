'use client';
import { useState } from 'react';
import { messageService } from '../lib/services';
import { friendlyError } from '../lib/postService';
export function WhisperComposer({ postId }: { postId: string }) {
  const [open, setOpen] = useState(false); const [body, setBody] = useState(''); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false); const [err, setErr] = useState('');
  const send = async () => { setBusy(true); setErr(''); try { await messageService.sendWhisper(postId, body); setSent(true); setBody(''); } catch (e) { setErr(friendlyError(e)); } setBusy(false); };
  if (sent) return <p className="meta">Whisper sent. Only the author can see it, and it disappears after 24 hours.</p>;
  if (!open) return <button className="btn ghost" onClick={() => setOpen(true)}>Whisper privately</button>;
  return (
    <form onSubmit={e => { e.preventDefault(); send(); }} style={{ display: 'grid', gap: 8 }}>
      <p className="meta">Only the author sees this. It disappears after 24 hours.</p>
      <textarea aria-label="Whisper" className="field" value={body} onChange={e => setBody(e.target.value)} maxLength={2000} rows={3} />
      {err && <p role="alert" style={{ color: 'var(--danger)' }}>{err}</p>}
      <div className="row"><button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn" disabled={busy || !body.trim()}>Send whisper</button></div>
    </form>
  );
}
