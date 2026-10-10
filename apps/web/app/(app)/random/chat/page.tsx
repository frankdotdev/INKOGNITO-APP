'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Flag, Ban, SkipForward, LogOut, Send } from 'lucide-react';
import type { ReportCategory } from '@inkognito/core';
import { RandomChat, type ChatMessage, type RandomState } from '../../../../lib/randomClient';
import { ChatBubble } from '../../../../components/ChatBubble';
import { ReportSheet } from '../../../../components/ReportSheet';
const status: Record<RandomState, string> = { idle: '', searching: 'Looking for someone…', connecting: 'Connecting…', waiting_partner: 'Connecting…', chatting: 'Connected. Say hi.', reconnecting: 'Connection dropped. Reconnecting…', peer_left: 'The stranger left.', ended: 'Chat ended.', error: "Couldn't connect.", permission_denied: '' };
export default function RandomChatPage() {
  const router = useRouter(); const chat = useRef<RandomChat | null>(null); const endRef = useRef<HTMLDivElement>(null); const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [state, setState] = useState<RandomState>('searching'); const [msgs, setMsgs] = useState<ChatMessage[]>([]); const [peerTyping, setPeerTyping] = useState(false);
  const [text, setText] = useState(''); const [notice, setNotice] = useState(''); const [report, setReport] = useState(false);
  useEffect(() => {
    const c = new RandomChat(process.env.NEXT_PUBLIC_RANDOM_WS_URL!, {
      onState: s => { setState(s); if (s === 'searching') { setMsgs([]); setPeerTyping(false); } },
      onMessage: m => { setMsgs(x => [...x, m]); if (!m.mine) setPeerTyping(false); },
      onTyping: on => { setPeerTyping(on); clearTimeout(typingTimer.current); if (on) typingTimer.current = setTimeout(() => setPeerTyping(false), 4000); },
      onNotice: t => { setNotice(t); setTimeout(() => setNotice(''), 3000); },
    });
    chat.current = c; c.join();
    return () => c.destroy();
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, peerTyping]);
  const send = () => { if (chat.current?.sendText(text)) { setText(''); chat.current.typing(false); } };
  const onType = (v: string) => { setText(v); chat.current?.typing(v.length > 0); };
  const live = state === 'chatting';
  const submitReport = useCallback(async (c: ReportCategory) => { if (!chat.current?.report(c)) throw new Error('not connected'); }, []);
  const block = () => { if (confirm('Block this person? You will not be matched with them again.')) chat.current?.block(); };
  return (
    <div className="chatfull">
      <header className="chathead"><div className="grow"><div className="name" role="status">{status[state]}</div>{peerTyping && <div className="meta">Stranger is typing…</div>}</div>
        <button className="act" aria-label="Report" disabled={!live} onClick={() => setReport(true)}><Flag size={20} /></button>
        <button className="act" aria-label="Block" disabled={!live} onClick={block}><Ban size={20} /></button>
        <button className="act" aria-label="Next" onClick={() => chat.current?.next()}><SkipForward size={20} /><span>Next</span></button>
        <button className="act" aria-label="Leave" onClick={() => { chat.current?.leave(); router.push('/random'); }}><LogOut size={20} /></button></header>
      {state === 'reconnecting' && <div className="banner warn" role="status" style={{ margin: 12 }}>Connection dropped. Reconnecting…</div>}
      <div className="chatlog" aria-live="polite">
        {(state === 'searching' || state === 'connecting' || state === 'waiting_partner') && <div className="pulse" aria-hidden />}
        {msgs.map(m => <ChatBubble key={m.id} mine={m.mine} text={m.text} />)}
        {(state === 'peer_left' || state === 'ended') && <div className="empty"><h2>{status[state]}</h2><p>Nothing from this chat is saved.</p><div className="row" style={{ justifyContent: 'center', marginTop: 16 }}><button className="btn" onClick={() => chat.current?.next()}>Meet someone new</button><button className="btn ghost" onClick={() => router.push('/random')}>Leave</button></div></div>}
        {state === 'error' && <div className="empty"><h2>{status.error}</h2><p>Check your connection and try again.</p><button className="btn" style={{ marginTop: 16 }} onClick={() => chat.current?.join()}>Try again</button></div>}
        <div ref={endRef} /></div>
      {notice && <div className="meta" role="status" style={{ padding: '0 16px' }}>{notice}</div>}
      <form className="chatinput" onSubmit={e => { e.preventDefault(); send(); }}>
        <input className="field" aria-label="Message" value={text} maxLength={1000} disabled={!live} placeholder={live ? 'Message' : ''} onChange={e => onType(e.target.value)} autoComplete="off" />
        <button className="btn" aria-label="Send" disabled={!live || !text.trim()}><Send size={20} /></button></form>
      {report && <ReportSheet submit={submitReport} onClose={() => setReport(false)} />}
    </div>);
}
