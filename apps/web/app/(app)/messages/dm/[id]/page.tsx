'use client';
import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Flag, Ban, LogOut, Send } from 'lucide-react';
import type { ReportCategory } from '@inkognito/core';
import { dmService, dmErrorText, type DmMessage } from '../../../../../lib/dmClient';
import { ChatBubble } from '../../../../../components/ChatBubble';
import { ReportSheet } from '../../../../../components/ReportSheet';
import { EmptyState } from '../../../../../components/ui';
export default function DmThread({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const router = useRouter(); const endRef = useRef<HTMLDivElement>(null);
  const [peer, setPeer] = useState(''); const [msgs, setMsgs] = useState<DmMessage[] | null>(null); const [gone, setGone] = useState(false); const [text, setText] = useState(''); const [err, setErr] = useState(''); const [report, setReport] = useState(false); const [busy, setBusy] = useState(false);
  const last = useRef('');
  useEffect(() => {
    let live = true;
    const load = async () => { try { const r = await dmService.messages(id); if (!live) return; setPeer(r.peer); const sig = r.messages.at(-1)?.id ?? ''; if (sig !== last.current) { last.current = sig; setMsgs(r.messages); if (r.messages.at(-1) && !r.messages.at(-1)!.mine) dmService.read(id).catch(() => {}); } else setMsgs(m => m ?? r.messages); }
      catch (e) { if (live && (e as { code?: string }).code && ['not_found', 'closed'].includes((e as { code: string }).code)) setGone(true); } };
    load(); const t = setInterval(() => document.visibilityState === 'visible' && load(), 4000); return () => { live = false; clearInterval(t); };
  }, [id]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);
  const send = async () => { const t = text.trim(); if (!t || busy) return; setBusy(true); setErr(''); try { await dmService.send(id, t); setText(''); last.current = ''; const r = await dmService.messages(id); setMsgs(r.messages); last.current = r.messages.at(-1)?.id ?? ''; } catch (e) { setErr(dmErrorText(e)); } setBusy(false); };
  const act = async (fn: () => Promise<unknown>, ask: string) => { if (!confirm(ask)) return; try { await fn(); router.push('/messages/dm'); } catch (e) { setErr(dmErrorText(e)); } };
  const submitReport = async (c: ReportCategory) => { await dmService.report(id, c); router.push('/messages/dm'); };
  if (gone) return <EmptyState title="This conversation has ended" hint="The other person left, or it was blocked." />;
  return (<div className="chatfull">
    <header className="chathead"><button className="act" aria-label="Back" onClick={() => router.push('/messages/dm')}><ArrowLeft size={20} /></button><div className="grow"><div className="name">{peer || 'Private chat'}</div><div className="meta">Private. Stored encrypted. Deleted after 90 days.</div></div>
      <button className="act" aria-label="Report" onClick={() => setReport(true)}><Flag size={20} /></button>
      <button className="act" aria-label="Block" onClick={() => act(() => dmService.block(id), 'Block this person? You will not see each other again.')}><Ban size={20} /></button>
      <button className="act" aria-label="Leave" onClick={() => act(() => dmService.leave(id), 'Leave this conversation? It is removed for you.')}><LogOut size={20} /></button></header>
    <div className="chatlog" aria-live="polite">{!msgs ? <div className="pulse" aria-hidden /> : msgs.length === 0 ? <div className="empty"><h2>Say hello</h2><p>Only the two of you can see this.</p></div> : msgs.map(m => <ChatBubble key={m.id} mine={m.mine} text={m.text} />)}<div ref={endRef} /></div>
    {err && <div className="meta" role="alert" style={{ color: 'var(--danger)', padding: '0 16px' }}>{err}</div>}
    <form className="chatinput" onSubmit={e => { e.preventDefault(); send(); }}><textarea className="field" aria-label="Message" rows={1} value={text} maxLength={2000} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} style={{ resize: 'none' }} /><button className="btn" aria-label="Send" disabled={busy || !text.trim()}><Send size={20} /></button></form>
    {report && <ReportSheet submit={submitReport} onClose={() => setReport(false)} />}
  </div>);
}
