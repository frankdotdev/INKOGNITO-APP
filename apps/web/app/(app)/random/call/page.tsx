'use client';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Flag, Ban, SkipForward, PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import type { ReportCategory } from '@inkognito/core';
import { RandomChat, type RandomState } from '../../../../lib/randomClient';
import { ReportSheet } from '../../../../components/ReportSheet';
const status: Record<RandomState, string> = { idle: '', searching: 'Looking for someone…', connecting: 'Connecting…', waiting_partner: 'Connecting…', chatting: 'Connected', reconnecting: 'Connection dropped. Reconnecting…', peer_left: 'The stranger left.', ended: 'Call ended.', error: "Couldn't connect.", permission_denied: 'Access blocked' };
export default function Call({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const mode: 'audio' | 'video' = use(searchParams).mode === 'audio' ? 'audio' : 'video'; const router = useRouter(); const chat = useRef<RandomChat | null>(null);
  const remote = useRef<HTMLVideoElement>(null), local = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<RandomState>('searching'); const [mic, setMic] = useState(true); const [cam, setCam] = useState(true); const [notice, setNotice] = useState(''); const [report, setReport] = useState(false); const [secs, setSecs] = useState(0); const [hasRemote, setHasRemote] = useState(false);
  useEffect(() => {
    const c = new RandomChat(process.env.NEXT_PUBLIC_RANDOM_WS_URL!, {
      onState: s => { setState(s); if (s === 'searching') { setSecs(0); setMic(true); setCam(true); } },
      onMessage: () => {}, onTyping: () => {}, onNotice: t => { setNotice(t); setTimeout(() => setNotice(''), 4000); },
      onLocalStream: s => { if (local.current) local.current.srcObject = s; },
      onRemoteStream: s => {
        if (remote.current && s) {
          remote.current.srcObject = s;
          remote.current.onloadedmetadata = () => {
            remote.current?.play().catch(() => {});
          };
          remote.current.play().catch(() => {});
        }
        setHasRemote(!!s && (mode === 'audio' || (s?.getVideoTracks()?.length ?? 0) > 0));
      },
    }, mode);
    chat.current = c; c.join(); return () => c.destroy();
  }, [mode]);
  useEffect(() => { if (state !== 'chatting') return; const t = setInterval(() => setSecs(x => x + 1), 1000); return () => clearInterval(t); }, [state]);
  const submitReport = useCallback(async (c: ReportCategory) => { if (!chat.current?.report(c)) throw new Error('not connected'); }, []);
  const mm = String(Math.floor(secs / 60)).padStart(2, '0'), ss = String(secs % 60).padStart(2, '0');
  const live = state === 'chatting';
  return (<div className="chatfull" style={{ background: '#000' }}>
    <header className="chathead" style={{ background: 'transparent', borderColor: 'transparent', position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 }}><div className="grow"><div className="name" role="status" style={{ color: '#fff' }}>{status[state]}{live ? ` · ${mm}:${ss}` : ''}</div></div>
      <button className="act" aria-label="Report" disabled={!live} onClick={() => setReport(true)} style={{ color: '#fff' }}><Flag size={20} /></button>
      <button className="act" aria-label="Block" disabled={!live} onClick={() => { if (confirm('Block this person? You will not be matched again.')) chat.current?.block(); }} style={{ color: '#fff' }}><Ban size={20} /></button></header>
    <div style={{ flex: 1, display: 'grid', placeItems: 'center', position: 'relative', overflow: 'hidden' }}>
      <video ref={remote} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: mode === 'video' && hasRemote ? 'block' : 'none' }} />
      {mode === 'audio' && <audio ref={remote as unknown as React.RefObject<HTMLAudioElement>} autoPlay />}
      {!(mode === 'video' && hasRemote) && <div style={{ color: '#fff', textAlign: 'center', display: 'grid', gap: 16, justifyItems: 'center' }}>{(state === 'searching' || state === 'connecting' || state === 'waiting_partner' || (live && mode === 'audio')) && <div className="pulse" aria-hidden />}
        {state === 'permission_denied' && <div><h2>We need your {mode === 'video' ? 'camera and microphone' : 'microphone'}</h2><p style={{ marginTop: 8 }}>Access was blocked. Allow it in your browser's site settings, then come back. Nobody was told why you left.</p></div>}
        {(state === 'peer_left' || state === 'ended' || state === 'error') && <div><h2>{status[state]}</h2><p style={{ marginTop: 8 }}>Nothing from this call is saved.</p></div>}</div>}
      {mode === 'video' && <video ref={local} autoPlay playsInline muted style={{ position: 'absolute', right: 12, bottom: 96, width: 110, height: 150, objectFit: 'cover', borderRadius: 12, border: '1px solid rgba(255,255,255,.3)', transform: 'scaleX(-1)', display: live || hasRemote ? 'block' : 'none' }} />}
      {notice && <div className="banner warn" role="status" style={{ position: 'absolute', top: 64 }}>{notice}</div>}
    </div>
    <div style={{ display: 'flex', gap: 12, justifyContent: 'center', padding: '14px 12px calc(14px + env(safe-area-inset-bottom))' }}>
      <button className="btn ghost" aria-label={mic ? 'Mute microphone' : 'Unmute microphone'} aria-pressed={!mic} disabled={!live} onClick={() => { chat.current?.setMic(!mic); setMic(!mic); }}>{mic ? <Mic size={20} /> : <MicOff size={20} />}</button>
      {mode === 'video' && <button className="btn ghost" aria-label={cam ? 'Turn camera off' : 'Turn camera on'} aria-pressed={!cam} disabled={!live} onClick={() => { chat.current?.setCamera(!cam); setCam(!cam); }}>{cam ? <Video size={20} /> : <VideoOff size={20} />}</button>}
      {(state === 'error' || state === 'peer_left' || state === 'ended') ? <button className="btn" onClick={() => chat.current?.next()}>Meet someone new</button> : <button className="btn ghost" aria-label="Next" onClick={() => chat.current?.next()}><SkipForward size={20} /> Next</button>}
      <button className="btn" style={{ background: 'var(--danger)' }} aria-label="Leave" onClick={() => { chat.current?.leave(); router.push('/random'); }}><PhoneOff size={20} /></button></div>
    {report && <ReportSheet submit={submitReport} onClose={() => setReport(false)} />}
  </div>);
}
