'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { IdentitySummary } from '@inkognito/core';
import { identityService } from '../../../../../lib/identityService';
export default function Purge() {
  const [s, setS] = useState<IdentitySummary | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { identityService.summary().then(setS).catch(() => {}); }, []);
  const run = async (fn: () => Promise<void>, message: string) => { if (!confirm(message)) return; setBusy(true); setErr(''); try { await fn(); window.location.href = '/void'; } catch { setErr('That failed. Nothing was changed on this device. Try again.'); setBusy(false); } };
  const last = s && s.deviceCount <= 1 && !s.hasRecovery;
  const danger = { background: 'var(--danger)' };
  return (<div className="prose"><h1 style={{ fontSize: 28, letterSpacing: '-.02em', color: 'var(--text-primary)' }}>Purge or delete</h1>
    <h2>Purge this device</h2><p>Removes your identity credentials and local data from this device and disconnects it. Your posts stay up, and other devices keep working.</p>
    {last && <p role="alert" style={{ color: 'var(--danger)' }}>This is your only device and you have no recovery code. Purging means you can never get this identity back.</p>}
    <button className="btn" style={danger} disabled={busy} onClick={() => run(() => identityService.purgeThisDevice(), last ? 'This is your only device and you have no recovery code. You will permanently lose this identity. Purge anyway?' : 'Purge this device?')}>Purge this device</button>
    <h2>Delete my content</h2><p>Deletes your posts and comments and removes your reactions, Echoes, saves, votes and sent Whispers. You keep your identity. <Link href="/settings/privacy" style={{ color: 'var(--accent)' }}>Go to Privacy</Link></p>
    <h2>Delete my anonymous identity</h2><p>Deletes your content and permanently closes this identity on all your devices. This can't be undone, and a recovery code will stop working.</p>
    <button className="btn" style={danger} disabled={busy} onClick={() => run(() => identityService.deleteIdentity(), 'Delete your identity and all your content on every device? This cannot be undone.')}>Delete my identity</button>
    {err && <p role="alert" style={{ color: 'var(--danger)' }}>{err}</p>}</div>);
}
