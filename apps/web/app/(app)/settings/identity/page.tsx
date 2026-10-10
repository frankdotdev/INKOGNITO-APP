'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Smartphone, KeyRound, QrCode as Qr, Trash2, ChevronRight } from 'lucide-react';
import type { IdentitySummary } from '@inkognito/core';
import { identityService } from '../../../../lib/identityService';
import { Skeleton, EmptyState } from '../../../../components/ui';
const h1 = { fontSize: 28, letterSpacing: '-.02em' } as const;
export default function IdentityPage() {
  const [s, setS] = useState<IdentitySummary | null>(null); const [err, setErr] = useState(false);
  useEffect(() => { identityService.summary().then(setS).catch(() => setErr(true)); }, []);
  const rows = [['/settings/identity/devices', 'Your devices', Smartphone], ['/settings/identity/link', 'Use an existing identity on this device', Qr], ['/settings/identity/recovery', 'Recovery code', KeyRound], ['/settings/identity/purge', 'Purge or delete', Trash2]] as const;
  return (<div style={{ display: 'grid', gap: 16 }}><h1 style={h1}>Identity</h1>
    {err ? <EmptyState title="Couldn't load your identity" hint="Check your connection and try again." /> : !s ? <Skeleton n={1} /> :
      <div className="card"><div className="name">Your anonymous identity</div>
        <p className="meta" style={{ marginTop: 8 }}>Created {new Date(s.createdAt).toLocaleDateString()}. {s.deviceCount} {s.deviceCount === 1 ? 'device' : 'devices'}. {s.hasRecovery ? 'Recovery code set.' : 'No recovery code yet: if you lose this device you lose this identity.'}</p>
        <p className="meta" style={{ marginTop: 8 }}>Nobody can see this identity. Other people only see a different generated name in each thread.</p></div>}
    <div>{rows.map(([h, l, I]) => <Link key={h} href={h} className="card row" style={{ minHeight: 56 }}><I size={20} /><span className="grow name">{l}</span><ChevronRight size={18} /></Link>)}</div></div>);
}
