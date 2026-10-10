import type { Mood, PublicIdentity } from '@inkognito/core';
export const IdentityBadge = ({ who, meta }: { who: PublicIdentity; meta?: string }) => (
  <div className="row"><span className="mark" aria-hidden>{who.name.split(' ').map(w => w[0]).join('')}</span>
    <div><div className="name">{who.claimedAlias ? '@' + who.claimedAlias : who.name}</div>{meta && <div className="meta">{meta}</div>}</div></div>
);
export const MoodBadge = ({ mood }: { mood: Mood }) => <span className="meta">{mood[0].toUpperCase() + mood.slice(1)}</span>;
export const EmptyState = ({ title, hint }: { title: string; hint?: string }) => <div className="empty"><h2>{title}</h2><p>{hint}</p></div>;
export const Skeleton = ({ n = 3 }: { n?: number }) => <div aria-busy="true">{Array.from({ length: n }, (_, i) => <div className="skel" key={i} />)}</div>;
export function ago(iso: string) {
  const m = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`; return `${Math.floor(h / 24)}d ago`;
}
export function fadesIn(iso?: string) {
  if (!iso) return null; const h = Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 3600000));
  return h <= 1 ? 'Fades within the hour' : `Fades in ${h}h`;
}
