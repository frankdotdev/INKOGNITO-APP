'use client';
import { useCallback, useEffect, useState } from 'react';
import type { DeviceInfo } from '@inkognito/core';
import { identityService } from '../../../../../lib/identityService';
import { timeAgo } from '../../../../../lib/time';
import { Skeleton, EmptyState } from '../../../../../components/ui';
export default function Devices() {
  const [items, setItems] = useState<DeviceInfo[] | null>(null); const [err, setErr] = useState('');
  const load = useCallback(() => identityService.listDevices().then(setItems).catch(() => setErr("Couldn't load your devices.")), []);
  useEffect(() => { load(); }, [load]);
  const revoke = async (d: DeviceInfo) => { if (!confirm(`Remove ${d.label}? It will lose access to this identity.`)) return; setErr(''); try { await identityService.revokeDevice(d.id); await load(); } catch { setErr("Couldn't remove the device."); } };
  return (<div style={{ display: 'grid', gap: 16 }}><h1 style={{ fontSize: 28, letterSpacing: '-.02em' }}>Your devices</h1>
    <p className="meta">To add a device: on the new device open Settings, Identity, Use an existing identity, then scan its code with this device's camera and approve it.</p>
    {err && <p role="alert" style={{ color: 'var(--danger)' }}>{err}</p>}
    {!items ? <Skeleton n={1} /> : items.length === 0 ? <EmptyState title="No devices listed" hint="Devices appear here after they open Inkognito." /> :
      items.map(d => <div key={d.id} className="list-row"><div className="grow"><div className="name">{d.label}{d.current ? ' (this device)' : ''}</div><div className="meta">Added {timeAgo(d.createdAt)}. Last active {timeAgo(d.lastSeenAt)}.</div></div>{!d.current && <button className="btn ghost" onClick={() => revoke(d)}>Remove</button>}</div>)}
  </div>);
}
