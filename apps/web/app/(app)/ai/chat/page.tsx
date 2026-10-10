'use client';
import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send } from 'lucide-react';
import { aiModes, aiService, aiErrorText, AiError, type AiMessage, type AiMode, type Safety } from '../../../../lib/aiClient';
import { ChatBubble } from '../../../../components/ChatBubble';
import { CrisisCard } from '../../../../components/CrisisCard';
const valid = (m?: string): AiMode => (aiModes.some(x => x[0] === m) ? (m as AiMode) : 'talk');
export default function AiChat({ searchParams }: { searchParams: Promise<{ s?: string; mode?: string }> }) {
  const q = use(searchParams); const router = useRouter(); const endRef = useRef<HTMLDivElement>(null);
  const [sessionId, setSessionId] = useState<string | null>(q.s ?? null); const [mode, setMode] = useState<AiMode>(valid(q.mode));
  const [msgs, setMsgs] = useState<AiMessage[]>([]); const [loading, setLoading] = useState(!!q.s); const [text, setText] = useState(''); const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(''); const [remaining, setRemaining] = useState<number | null>(null); const [safety, setSafety] = useState<Safety>(null);
  useEffect(() => { if (!q.s) return; aiService.messages(q.s).then(m => { setMsgs(m); setLoading(false); }).catch(e => { setErr(aiErrorText(e)); setLoading(false); }); }, [q.s]);
  useEffect(() => { aiService.usage().then(u => setRemaining(u.remaining)).catch(() => {}); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, safety]);
  const send = async () => {
    const message = text.trim(); if (!message || busy) return;
    setBusy(true); setErr(''); setText(''); const uid = crypto.randomUUID(), aid = crypto.randomUUID();
    setMsgs(m => [...m, { id: uid, role: 'user', text: message }, { id: aid, role: 'assistant', text: '' }]);
    try {
      await aiService.chat({ message, sessionId, mode }, {
        meta: m => { setSessionId(m.sessionId); setRemaining(m.remaining); setSafety(m.safety); },
        token: t => setMsgs(x => x.map(y => (y.id === aid ? { ...y, text: y.text + t } : y))),
      });
      window.history.replaceState(null, '', `/ai/chat?s=${sessionStorageId()}&mode=${mode}`);
    } catch (e) {
      setMsgs(x => x.filter(y => !(y.id === aid && !y.text)).filter(y => y.id !== uid || y.text)); // drop the empty reply
      setMsgs(x => (x.some(y => y.id === aid) ? x : x.filter(y => y.id !== uid)));
      setText(message); setErr(aiErrorText(e)); if (e instanceof AiError && e.code === 'quota_exceeded') setRemaining(0);
    }
    setBusy(false);
  };
  const sessionStorageId = () => sessionIdRef.current ?? '';
  const sessionIdRef = useRef<string | null>(sessionId); sessionIdRef.current = sessionId;
  return (
    <div className="chatfull">
      <header className="chathead"><button className="act" aria-label="Back" onClick={() => router.push('/ai')}><ArrowLeft size={20} /></button>
        <div className="grow"><div className="name">Companion</div><div className="meta">{remaining !== null ? `${remaining} messages left today` : 'AI, not a person'}</div></div></header>
      <div className="tabs" role="group" aria-label="Mode" style={{ padding: '8px 12px 0', marginBottom: 0 }}>{aiModes.map(([m, l]) => <button key={m} className="tab" aria-selected={m === mode} onClick={() => setMode(m)}>{l}</button>)}</div>
      <div className="chatlog" aria-live="polite">
        {loading && <div className="pulse" aria-hidden />}
        {!loading && msgs.length === 0 && <div className="empty"><h2>What's on your mind?</h2><p>You're talking to an AI. Nothing you say here is shared with anyone on Inkognito.</p></div>}
        {msgs.map(m => m.role === 'assistant' && !m.text ? <div key={m.id} className="meta" aria-label="The companion is typing">…</div> : <ChatBubble key={m.id} mine={m.role === 'user'} text={m.text} />)}
        {safety && <CrisisCard kind={safety} />}
        <div ref={endRef} /></div>
      {err && <div className="meta" role="alert" style={{ color: 'var(--danger)', padding: '0 16px' }}>{err}</div>}
      <form className="chatinput" onSubmit={e => { e.preventDefault(); send(); }}>
        <textarea className="field" aria-label="Message your companion" rows={1} value={text} maxLength={2000} placeholder={remaining === 0 ? 'No messages left today' : 'Message your companion…'} disabled={busy || remaining === 0}
          onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} style={{ resize: 'none' }} />
        <button className="btn" aria-label="Send" disabled={busy || !text.trim() || remaining === 0}><Send size={20} /></button></form>
    </div>);
}
