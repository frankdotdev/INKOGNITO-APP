'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, canModerate } from '../lib/api';
import { useRole } from './AuthGate';
type Pending = { title: string; confirm: string; danger?: boolean; run: (reason: string) => Promise<void> } | null;
export function usePending() { return useState<Pending>(null); }
export function IdentityLink({ type, id }: { type: string; id: string }) {
  const router = useRouter(); const role = useRole(); const [err, setErr] = useState(false);
  if (!canModerate(role)) return null;
  return <button className="btn sm" onClick={async () => { try { router.push(`/identities/${await api.targetIdentity(type, id)}`); } catch { setErr(true); } }}>{err ? 'Unavailable' : 'Identity'}</button>;
}
