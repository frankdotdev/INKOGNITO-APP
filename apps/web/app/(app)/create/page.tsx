'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Mood } from '@inkognito/core';
import { postService, friendlyError } from '../../../lib/postService';
import { mediaEnabled, uploadImage, imageError, type UploadedImage } from '../../../lib/mediaService';
import { ImagePlus, X } from 'lucide-react';
const moods: Mood[] = ['relieved','hopeful','lost','angry','peaceful','confused','heartbroken','excited','numb','grateful','anxious','proud','lonely','guilty','heavy'];
import { categories as cats } from '../../../lib/categories';
export default function Create() {
  const r = useRouter();
  const [body, setBody] = useState(''); const [mood, setMood] = useState<Mood | ''>(''); const [cat, setCat] = useState('');
  const [poll, setPoll] = useState(''); const [fade, setFade] = useState(false); const [comments, setComments] = useState(true); const [share, setShare] = useState(true);
  const [images, setImages] = useState<UploadedImage[]>([]); const [uploading, setUploading] = useState(false); const [imgErr, setImgErr] = useState('');
  const pick = async (files: FileList | null) => {
    if (!files) return; setImgErr('');
    for (const f of Array.from(files).slice(0, 4 - images.length)) {
      setUploading(true);
      try { const img = await uploadImage(f); setImages(x => [...x, img]); } catch (e) { setImgErr(imageError(e)); }
      setUploading(false);
    }
  };
  const posted = useRef(false); const [drafted, setDrafted] = useState(false);
  useEffect(() => { try { const d = JSON.parse(localStorage.getItem('ink-draft') ?? 'null'); if (d) { setBody(d.body ?? ''); setMood(d.mood ?? ''); setCat(d.cat ?? ''); setPoll(d.poll ?? ''); } } catch {} }, []);
  useEffect(() => {
    const t = setTimeout(() => { if (posted.current) return; try { if (body.trim()) { localStorage.setItem('ink-draft', JSON.stringify({ body, mood, cat, poll })); setDrafted(true); } else { localStorage.removeItem('ink-draft'); setDrafted(false); } } catch {} }, 500);
    return () => clearTimeout(t);
  }, [body, mood, cat, poll]);
  const [held, setHeld] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const submit = async () => {
    setBusy(true); setErr('');
    try { const made = await postService.createPost({ body, mood: mood || undefined, category: cat || undefined, poll: poll.trim() ? { question: poll } : undefined, fadingHours: fade ? 24 : undefined, commentsEnabled: comments, allowSharing: share, mediaIds: images.map(i => i.id) }); posted.current = true; try { localStorage.removeItem('ink-draft'); } catch {} if (made.pendingReview) { setHeld(true); setBusy(false); return; } r.push('/void'); }
    catch (e) { setErr(friendlyError(e)); setBusy(false); }
  };
  const field: React.CSSProperties = { width: '100%', background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text-primary)', padding: '12px', minHeight: 44, font: 'inherit' };
  if (held) return (<div style={{ display: 'grid', gap: 16, justifyItems: 'start' }}><h1 style={{ fontSize: 28, letterSpacing: '-.02em' }}>Thanks, it's with a moderator</h1>
    <p className="meta" role="status">Posts with images are checked before they appear. Yours will show up as soon as it's approved. You don't need to do anything.</p>
    <button className="btn" onClick={() => r.push('/void')}>Back to the Void</button></div>);
  return (
    <form onSubmit={e => { e.preventDefault(); submit(); }} style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ fontSize: 28, letterSpacing: '-.02em' }}>What's on your mind?</h1>
      <textarea aria-label="Your confession" value={body} onChange={e => setBody(e.target.value)} maxLength={5000} rows={8} autoFocus style={{ ...field, fontSize: 18, lineHeight: 1.5, resize: 'vertical' }} />
      {drafted && <p className="meta" role="status">Draft saved on this device.</p>}
      {mediaEnabled && <div style={{ display: 'grid', gap: 8 }}>
        {images.length > 0 && <div className="row" style={{ flexWrap: 'wrap' }}>{images.map(i => <div key={i.id} style={{ position: 'relative' }}>
          <img src={i.preview} alt="Attached" width={96} height={96} style={{ objectFit: 'cover', borderRadius: 12 }} />
          <button type="button" className="act" aria-label="Remove image" style={{ position: 'absolute', top: -8, right: -8, background: 'var(--surface-overlay)', borderRadius: 999 }} onClick={() => setImages(x => x.filter(y => y.id !== i.id))}><X size={16} /></button></div>)}</div>}
        {images.length < 4 && <label className="btn ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, width: 'fit-content', cursor: 'pointer' }}><ImagePlus size={20} />{uploading ? 'Uploading…' : 'Add image'}
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden disabled={uploading} onChange={e => { pick(e.target.files); e.target.value = ''; }} /></label>}
        <p className="meta">Location and camera details are removed from your photo before it is uploaded.</p>
        {imgErr && <p role="alert" style={{ color: 'var(--danger)' }}>{imgErr}</p>}</div>}
      <label>Mood <select value={mood} onChange={e => setMood(e.target.value as Mood)} style={field}><option value="">None</option>{moods.map(m => <option key={m} value={m}>{m[0].toUpperCase() + m.slice(1)}</option>)}</select></label>
      <label>Category <select value={cat} onChange={e => setCat(e.target.value)} style={field}><option value="">None</option>{cats.map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Ask a yes/no question (optional) <input value={poll} onChange={e => setPoll(e.target.value)} maxLength={280} style={field} /></label>
      <label className="row"><input type="checkbox" checked={fade} onChange={e => setFade(e.target.checked)} /> Fade after 24 hours</label>
      <label className="row"><input type="checkbox" checked={comments} onChange={e => setComments(e.target.checked)} /> Allow comments</label>
      <label className="row"><input type="checkbox" checked={share} onChange={e => setShare(e.target.checked)} /> Let people share this as a link</label>
      {err && <p role="alert" style={{ color: 'var(--danger)' }}>{err}</p>}
      <button type="submit" disabled={busy || uploading || !body.trim()} style={{ ...field, background: 'var(--accent)', border: 0, fontWeight: 700, opacity: busy || !body.trim() ? .5 : 1 }}>{busy ? 'Posting…' : 'Post anonymously'}</button>
    </form>
  );
}
