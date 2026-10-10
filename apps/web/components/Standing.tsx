'use client';
import { useEffect, useState } from 'react';
import { rpc } from '../lib/postService';
type S = { streak: number; longest_streak: number; show_streak: boolean; resonance: number; level: number };
const levels = ['New here', 'Finding your voice', 'A regular', 'Trusted'];
/** Private and quiet: no push, no counts anyone else sees. Opening the app earns nothing; only a post, comment, Echo or Whisper does. */
export function Standing() {
  const [s, setS] = useState<S | null>(null); const [err, setErr] = useState(false);
  useEffect(() => { rpc<S>('my_standing').then(setS).catch(() => setErr(true)); }, []);
  if (err || !s) return null;
  const toggle = async (on: boolean) => { setS({ ...s, show_streak: on }); try { await rpc('set_show_streak', { p_on: on }); } catch { setS(s); } };
  return (<div className="card" style={{ display: 'grid', gap: 8 }}>
    <div className="row"><span className="name">{levels[s.level]}</span><span className="grow" /><span className="meta">Resonance {s.resonance}</span></div>
    {s.show_streak && <div className="meta">{s.streak > 0 ? `${s.streak}-day streak` : 'No streak right now'}{s.longest_streak > 1 ? ` · best ${s.longest_streak}` : ''}</div>}
    <p className="meta">Resonance grows when people react to, answer or Echo what you write. A streak counts days you took part by writing something. Nobody else sees any of this.</p>
    <label className="row meta"><input type="checkbox" checked={s.show_streak} onChange={e => toggle(e.target.checked)} /> Show my streak</label></div>);
}
