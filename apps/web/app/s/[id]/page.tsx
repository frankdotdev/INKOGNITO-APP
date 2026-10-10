import type { Metadata } from 'next';
import { getPublicPost, excerpt } from '../../../lib/publicApi';
import { SharedCard } from '../../../components/SharedCard';
import { SharedGone } from '../../../components/SharedGone';
import { timeAgo } from '../../../lib/time';
export const revalidate = 60;
type P = { params: Promise<{ id: string }> };
export async function generateMetadata({ params }: P): Promise<Metadata> {
  const p = await getPublicPost((await params).id);
  if (!p) return { title: 'Inkognito', robots: { index: false, follow: false } };
  const title = `${p.authorName} on Inkognito`, description = excerpt(p.body, 160);
  return { title, description, robots: { index: false, follow: false }, openGraph: { title, description, type: 'article', siteName: 'Inkognito' }, twitter: { card: 'summary_large_image', title, description } };
}
export default async function SharedPost({ params }: P) {
  const p = await getPublicPost((await params).id);
  if (!p) return <SharedGone />;
  const meta = [timeAgo(p.createdAt), p.category, p.mood ? p.mood[0].toUpperCase() + p.mood.slice(1) : null].filter(Boolean).join(' · ');
  return <SharedCard name={p.authorName} meta={meta} body={p.body} poll={p.pollQuestion} href={`/post/${p.id}`} cta="Join the conversation" />;
}
