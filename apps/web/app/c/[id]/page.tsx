import type { Metadata } from 'next';
import { getPublicComment, excerpt } from '../../../lib/publicApi';
import { SharedCard } from '../../../components/SharedCard';
import { SharedGone } from '../../../components/SharedGone';
import { timeAgo } from '../../../lib/time';
export const revalidate = 60;
type P = { params: Promise<{ id: string }> };
export async function generateMetadata({ params }: P): Promise<Metadata> {
  const c = await getPublicComment((await params).id);
  if (!c) return { title: 'Inkognito', robots: { index: false, follow: false } };
  const title = `${c.authorName} replied on Inkognito`, description = excerpt(c.body, 160);
  return { title, description, robots: { index: false, follow: false }, openGraph: { title, description, type: 'article', siteName: 'Inkognito' }, twitter: { card: 'summary_large_image', title, description } };
}
export default async function SharedComment({ params }: P) {
  const c = await getPublicComment((await params).id);
  if (!c) return <SharedGone />;
  return <SharedCard name={c.authorName} meta={timeAgo(c.createdAt)} body={c.body} context={`Replying to: “${excerpt(c.postExcerpt, 100)}”`} href={`/post/${c.postId}`} cta="Join the conversation" />;
}
