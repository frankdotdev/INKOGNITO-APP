import type { Metadata } from 'next';
import Link from 'next/link';
import { getPublicAlias } from '../../../lib/publicApi';
import { SharedGone } from '../../../components/SharedGone';
import { timeAgo } from '../../../lib/time';
export const revalidate = 60;
type P = { params: Promise<{ alias: string }> };
export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { alias } = await params; const a = await getPublicAlias(alias);
  return { title: a ? `@${a.alias} on Inkognito` : 'Inkognito', robots: { index: false, follow: false } };
}
/** A deliberately small public page: the name, when it was claimed, and posts made under it. No followers, no counts of people. */
export default async function AliasPage({ params }: P) {
  const a = await getPublicAlias((await params).alias);
  if (!a) return <SharedGone />;
  return (<main style={{ maxWidth: 560, margin: '0 auto', padding: '48px 16px', display: 'grid', gap: 24 }}>
    <div className="wordmark" style={{ padding: 0 }}>inkognito</div>
    <div><h1 style={{ fontSize: 32, letterSpacing: '-.03em' }}>@{a.alias}</h1><p className="meta">Claimed {new Date(a.claimedAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} · {a.postCount} public {a.postCount === 1 ? 'post' : 'posts'}</p></div>
    {a.posts.map(p => <Link key={p.id} href={`/s/${p.id}`} className="card" style={{ display: 'block' }}><p className="body" style={{ margin: 0 }}>{p.body}</p><div className="meta" style={{ marginTop: 8 }}>{timeAgo(p.created_at)}</div></Link>)}
    <Link href="/void" className="btn" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>Join the conversation</Link></main>);
}
