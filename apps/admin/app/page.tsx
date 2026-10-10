'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, friendly, type Metrics } from '../lib/api';
const LIMIT_MB = Number(process.env.NEXT_PUBLIC_DB_LIMIT_MB ?? 500);
const n = (v: unknown) => Number(v ?? 0).toLocaleString();
export default function Dashboard() {
  const [m, setM] = useState<Metrics | null>(null); const [review, setReview] = useState<number | null>(null); const [err, setErr] = useState(''); const [id, setId] = useState(''); const router = useRouter();
  const load = useCallback(() => { api.metrics().then(x => { setM(x); setErr(''); }).catch(e => setErr(friendly(e))); api.reviewCount().then(setReview).catch(() => setReview(null)); }, []);
  useEffect(() => { load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);
  if (err) return <div className="err" role="alert">{err}</div>;
  if (!m) return <div className="dim">Loading…</div>;
  const mb = Number(m.database_bytes) / 1_048_576, pct = Math.round((mb / LIMIT_MB) * 100), level = pct >= 85 ? 'crit' : pct >= 60 ? 'warn' : 'ok';
  const Card = ({ k, v, link, tone, sub }: { k: string; v: string; link?: string; tone?: string; sub?: string }) => <div className={`metric ${tone === 'crit' || tone === 'warn' ? tone : ''}`}><div className="k">{k}</div><div className="v">{link ? <Link href={link}>{v}</Link> : v}</div>{sub && <div className={`s ${tone ?? ''}`}>{sub}</div>}</div>;
  return (<div><div className="row" style={{ justifyContent: 'space-between' }}><h1>Dashboard</h1><span className="dim">Updated {new Date(String(m.generated_at)).toLocaleTimeString()} <button className="btn sm" onClick={load}>Refresh</button></span></div>
    {level !== 'ok' && <div className={`metric ${level}`} role="alert" style={{ marginBottom: 12 }}>Database is at {pct}% of its {LIMIT_MB} MB limit. {level === 'crit' ? 'Upgrade now.' : 'Plan an upgrade (Supabase Pro) before it reaches 85%.'}</div>}
    <h2>Needs attention</h2><div className="grid">
      {review !== null && <Card k="Posts awaiting image review" v={n(review)} link="/review" tone={review > 0 ? 'warn' : undefined} />}
      <Card k="Open content reports" v={n(m.reports_open)} link="/reports" tone={Number(m.reports_open) > 0 ? 'warn' : undefined} />
      <Card k="Open random-chat reports" v={n(m.random_reports_open)} link="/random" tone={Number(m.random_reports_open) > 0 ? 'warn' : undefined} />
      <Card k="Restricted identities" v={n(m.restricted_identities)} /></div>
    <h2>People</h2><div className="grid"><Card k="Active today (DAU)" v={n(m.dau)} /><Card k="Active 7 days (WAU)" v={n(m.wau)} /><Card k="Active 30 days (MAU)" v={n(m.mau)} /><Card k="New identities today" v={n(m.new_identities_today)} /></div>
    <h2>Activity today</h2><div className="grid"><Card k="Posts" v={n(m.posts_today)} /><Card k="Comments" v={n(m.comments_today)} /><Card k="Echoes" v={n(m.echoes_today)} /><Card k="Whispers" v={n(m.whispers_today)} /><Card k="Random chats" v={n(m.random_sessions_today)} /></div>
    <h2>Plus and AI</h2><div className="grid"><Card k="Plus subscribers" v={n(m.plus_active)} /><Card k="Names claimed" v={n(m.aliases_claimed)} /><Card k="Orders needing review" v={n(m.orders_needing_review)} link="/orders" tone={Number(m.orders_needing_review) > 0 ? 'warn' : undefined} />
      <Card k="Companion messages today" v={n(m.ai_messages_today)} /><Card k="Companion tokens today" v={n(m.ai_tokens_today)} /><Card k="Distress events today" v={n(m.ai_safety_events_today)} sub="Counts only, never text" /></div>
    <h2>Infrastructure</h2><div className="grid"><Card k="Database size" v={`${mb.toFixed(1)} MB`} tone={level} sub={`${pct}% of ${LIMIT_MB} MB`} /><Card k="Images stored" v={n(m.media_objects)} /></div>
    <h2>Open an identity record</h2>
    <form className="row" onSubmit={e => { e.preventDefault(); if (id.trim()) router.push(`/identities/${id.trim()}`); }}><input className="mono" placeholder="Anonymous ID" value={id} onChange={e => setId(e.target.value)} style={{ width: 340 }} /><button className="btn">Open</button></form>
    <p className="dim" style={{ marginTop: 6 }}>Opening a record is written to the audit log.</p></div>);
}
