'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { aiEnabled, aiModes, aiService, aiErrorText, type AiMode, type AiSession } from '../../../lib/aiClient';
import { EmptyState, Skeleton } from '../../../components/ui';
import { timeAgo } from '../../../lib/time';
export default function AiHome() {
  const [mode, setMode] = useState<AiMode>('talk'); const [sessions, setSessions] = useState<AiSession[] | null>(null); const [usage, setUsage] = useState<{ remaining: number; limit: number } | null>(null); const [err, setErr] = useState('');
  const load = useCallback(() => { if (!aiEnabled) return; Promise.all([aiService.sessions(), aiService.usage()]).then(([s, u]) => { setSessions(s); setUsage(u); setErr(''); }).catch(e => setErr(aiErrorText(e))); }, []);
  useEffect(() => { load(); }, [load]);
  if (!aiEnabled) return <EmptyState title="The companion isn't available" hint="It hasn't been switched on for this deployment." />;
  const del = async (id: string) => { if (!confirm('Delete this conversation? This cannot be undone.')) return; try { await aiService.remove(id); load(); } catch (e) { setErr(aiErrorText(e)); } };
  const delAll = async () => { if (!confirm('Delete all your companion conversations? This cannot be undone.')) return; try { await aiService.removeAll(); load(); } catch (e) { setErr(aiErrorText(e)); } };
  return (<div style={{ display: 'grid', gap: 16 }}>
    <h1 style={{ fontSize: 'clamp(32px,8vw,48px)', letterSpacing: '-.035em', lineHeight: 1.05 }}>Your quiet corner.</h1>
    <p className="meta" style={{ fontSize: 17 }}>Talk. Think. Unload.</p>
    <div className="tabs" role="group" aria-label="How do you want to talk?">{aiModes.map(([m, l]) => <button key={m} className="tab" aria-selected={m === mode} onClick={() => setMode(m)} title={aiModes.find(x => x[0] === m)![2]}>{l}</button>)}</div>
    <Link href={`/ai/chat?mode=${mode}`} className="btn" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 52, fontSize: 17 }}>Start a conversation</Link>
    {usage && <p className="meta" role="status">{usage.remaining} of {usage.limit} messages left today. They reset at midnight UTC.</p>}
    <p className="meta">The companion is an AI, not a person or a professional. Your messages are sent to an AI service to write replies, stored encrypted, and deleted after 90 days or when you delete them. Don't share anything you wouldn't want an AI provider to process.</p>
    {err && <p role="alert" style={{ color: 'var(--danger)' }}>{err}</p>}
    <h3 className="h">Earlier</h3>
    {!sessions ? <Skeleton n={1} /> : sessions.length === 0 ? <p className="meta">Nothing yet. Conversations you have appear here, only for you.</p> :
      <>{sessions.map(s => <div key={s.id} className="list-row"><Link href={`/ai/chat?s=${s.id}&mode=${s.mode}`} className="grow"><div className="name">{s.title}</div><div className="meta">{timeAgo(s.lastActivityAt)}</div></Link><button className="btn ghost" onClick={() => del(s.id)} aria-label="Delete conversation">Delete</button></div>)}
        <button className="btn ghost" style={{ width: 'fit-content' }} onClick={delAll}>Delete all conversations</button></>}
  </div>);
}
