'use client';
import { useEffect, useState } from 'react';
import { pushConfigured, pushState, enablePush, disablePush, getPrefs, setPrefs, type PushState, type NotificationPrefs } from '../../../../lib/pushClient';
import { EmptyState } from '../../../../components/ui';
const rows: [keyof NotificationPrefs, string, string][] = [['replies', 'Replies', 'When someone comments on your confession'], ['whispers', 'Whispers', 'When someone sends you a Whisper'], ['messages', 'Private messages', 'When someone writes in a private chat'], ['activity', 'Echoes', 'When someone Echoes your confession (off by default)']];
export default function Notifications() {
  const [state, setState] = useState<PushState | null>(null); const [prefs, setP] = useState<NotificationPrefs | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { pushState().then(setState); getPrefs().then(setP).catch(() => {}); }, []);
  if (!pushConfigured) return <EmptyState title="Notifications aren't available" hint="They haven't been switched on for this deployment." />;
  const toggle = async () => { setBusy(true); setErr(''); try { if (state === 'on') { await disablePush(); setState('off'); } else setState(await enablePush()); } catch { setErr("Couldn't change that. Check your connection and try again."); } setBusy(false); };
  const change = async (k: keyof NotificationPrefs, v: boolean) => { if (!prefs) return; const next = { ...prefs, [k]: v }; setP(next); try { await setPrefs(next); } catch { setP(prefs); setErr("Couldn't save that."); } };
  return (<div style={{ display: 'grid', gap: 16 }}><h1 style={{ fontSize: 28, letterSpacing: '-.02em' }}>Notifications</h1>
    <p className="meta">A notification only ever says that something happened ("Someone replied to your confession"). It never shows what was written or who wrote it, and we never send reminders to come back.</p>
    {state === 'unsupported' && <p role="status">This browser can't receive notifications. On iPhone, add Inkognito to your Home Screen first (iOS 16.4 or later), then open it from there.</p>}
    {state === 'denied' && <p role="status">Notifications are blocked for this site. Allow them in your browser's site settings, then come back.</p>}
    {(state === 'on' || state === 'off') && <button className={state === 'on' ? 'btn ghost' : 'btn'} disabled={busy} onClick={toggle}>{busy ? 'Working…' : state === 'on' ? 'Turn off on this device' : 'Turn on for this device'}</button>}
    {err && <p role="alert" style={{ color: 'var(--danger)' }}>{err}</p>}
    {prefs && <><h3 className="h">Tell me about</h3>{rows.map(([k, l, d]) => <label key={k} className="list-row" style={{ cursor: 'pointer' }}><div className="grow"><div className="name">{l}</div><div className="meta">{d}</div></div><input type="checkbox" checked={prefs[k]} onChange={e => change(k, e.target.checked)} aria-label={l} /></label>)}
      <p className="meta">Notifications about the same thing are combined, at most one every 10 minutes.</p></>}
  </div>);
}
