'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare, Mic, Video, ArrowRight } from 'lucide-react';
import { EmptyState } from '../../../components/ui';
import { rpc } from '../../../lib/postService';
const enabled = !!process.env.NEXT_PUBLIC_RANDOM_WS_URL;
type Mode = 'text' | 'audio' | 'video';
export default function RandomHub() {
  const r = useRouter(); const [pick, setPick] = useState<Mode | null>(null); const [adult, setAdult] = useState(false); const [avail, setAvail] = useState<{ audio: boolean; video: boolean }>({ audio: false, video: false }); const [err, setErr] = useState('');
  useEffect(() => { if (enabled) rpc<{ audio: boolean; video: boolean }>('random_availability').then(setAvail).catch(() => {}); }, []);
  const go = (m: Mode) => `/random/${m === 'text' ? 'chat' : `call?mode=${m}`}`;
  const start = (m: Mode) => { let seen = false; try { seen = localStorage.getItem('ink-random-safety') === '1' && (m === 'text' || localStorage.getItem('ink-random-adult') === '1'); } catch {} if (seen) r.push(go(m)); else { setPick(m); setAdult(false); } };
  const accept = async () => { if (!pick) return; setErr(''); try { await rpc('confirm_adult'); try { localStorage.setItem('ink-random-safety', '1'); localStorage.setItem('ink-random-adult', '1'); } catch {} r.push(go(pick)); } catch { setErr("Couldn't save that. Check your connection and try again."); } };
  if (!enabled) return <EmptyState title="Random chat isn't available" hint="It hasn't been switched on for this deployment." />;
  const Card = ({ m, I, t, d }: { m: Mode; I: typeof Mic; t: string; d: string }) => <button className="card" onClick={() => start(m)} style={{ textAlign: 'left', display: 'grid', gap: 8, width: '100%' }}><I size={24} style={{ color: 'var(--accent)' }} /><div className="name" style={{ fontSize: 22 }}>{t}</div><div className="meta">{d}</div><div className="row name" style={{ color: 'var(--accent)' }}>Start <ArrowRight size={18} /></div></button>;
  return (<div style={{ display: 'grid', gap: 16 }}>
    <h1 style={{ fontSize: 'clamp(32px,8vw,48px)', letterSpacing: '-.035em', lineHeight: 1.05 }}>Meet someone.</h1>
    <p className="meta" style={{ fontSize: 17 }}>Say something. Leave whenever you want.</p>
    <Card m="text" I={MessageSquare} t="Text" d="Talk anonymously with a stranger." />
    {avail.audio && <Card m="audio" I={Mic} t="Audio" d="Hear a stranger. No video, no recording." />}
    {avail.video && <Card m="video" I={Video} t="Video" d="Meet a stranger face to face. No recording." />}
    {pick && <div className="scrim"><div className="sheet" role="dialog" aria-modal="true" aria-label="Before you start">
      <h2>Before you start</h2>
      <ul className="prose" style={{ paddingLeft: 18 }}>
        <li>Report, Block, Next and Leave are always on screen.</li>
        <li>{pick === 'text' ? "Chats aren't recorded. If you report someone, the last 30 messages are sent to moderators, then erased." : "Calls are never recorded by us. But the other person could record their screen, so don't show or say anything you wouldn't want kept."}</li>
        <li>Never share your name, address, or anything that could identify you.</li>
        <li>If someone is in danger, contact your local emergency services.</li>
      </ul>
      <label className="row"><input type="checkbox" checked={adult} onChange={e => setAdult(e.target.checked)} /> I am 18 or older</label>
      {err && <p role="alert" style={{ color: 'var(--danger)' }}>{err}</p>}
      <div className="row"><button className="btn ghost" onClick={() => setPick(null)}>Cancel</button><button className="btn" disabled={!adult} onClick={accept}>Start</button></div></div></div>}
  </div>);
}
