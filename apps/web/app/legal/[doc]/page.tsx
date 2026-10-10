import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { renderMarkdown } from '../../../lib/markdown';
const DOCS: Record<string, string> = { terms: 'Terms of Service', privacy: 'Privacy Policy' };
export const dynamic = 'force-static';
export function generateStaticParams() { return Object.keys(DOCS).map(doc => ({ doc })); }
function read(doc: string): string | null { try { return readFileSync(join(process.cwd(), 'content', 'legal', `${doc}.md`), 'utf8'); } catch { return null; } }
export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }) { const { doc } = await params; return { title: `${DOCS[doc] ?? 'Legal'} · Inkognito` }; }
export default async function Legal({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params; const md = DOCS[doc] ? read(doc) : null; if (!md) notFound();
  return (<main className="prose" style={{ maxWidth: 680, margin: '0 auto', padding: '48px 20px' }}><Link href="/void" className="wordmark" style={{ padding: 0 }}>inkognito</Link>{renderMarkdown(md as string)}</main>);
}
