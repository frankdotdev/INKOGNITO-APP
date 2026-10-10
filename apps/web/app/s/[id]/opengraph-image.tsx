import { getPublicPost } from '../../../lib/publicApi';
import { renderCard, ogSize } from '../../../lib/ogCard';
export const alt = 'A confession on Inkognito';
export const size = ogSize;
export const contentType = 'image/png';
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const p = await getPublicPost((await params).id);
  return renderCard(p ? { name: p.authorName, body: p.body, meta: p.mood ? p.mood[0].toUpperCase() + p.mood.slice(1) : undefined } : { name: 'Inkognito', body: "Say what you can't say anywhere else." });
}
