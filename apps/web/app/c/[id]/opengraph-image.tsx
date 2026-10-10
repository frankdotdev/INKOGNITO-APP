import { getPublicComment, excerpt } from '../../../lib/publicApi';
import { renderCard, ogSize } from '../../../lib/ogCard';
export const alt = 'A reply on Inkognito';
export const size = ogSize;
export const contentType = 'image/png';
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const c = await getPublicComment((await params).id);
  return renderCard(c ? { name: c.authorName, body: c.body, context: `Replying to: “${excerpt(c.postExcerpt, 90)}”` } : { name: 'Inkognito', body: "Say what you can't say anywhere else." });
}
