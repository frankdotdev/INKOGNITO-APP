'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shuffle } from 'lucide-react';
import { postService } from '../lib/postService';
export function TakeMeSomewhere() {
  const r = useRouter(); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const go = async () => { setBusy(true); setMsg(''); try { const p = await postService.takeMeSomewhere(); r.push(`/post/${p.id}`); } catch (e) { setMsg(e instanceof Error && e.message === 'not_found' ? "There's nothing to find yet." : "Couldn't reach Inkognito. Try again."); setBusy(false); } };
  return <div><button className="btn" style={{ width: '100%', display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }} disabled={busy} onClick={go}><Shuffle size={20} />{busy ? 'Finding something…' : 'Take me somewhere'}</button>{msg && <p role="alert" className="meta">{msg}</p>}</div>;
}
