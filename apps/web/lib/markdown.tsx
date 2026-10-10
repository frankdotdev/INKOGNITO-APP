import type { ReactNode } from 'react';
const inline = (t: string, key: string): ReactNode[] => {
  const out: ReactNode[] = []; const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g; let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(t))) { if (m.index > last) out.push(t.slice(last, m.index)); out.push(m[1] ? <strong key={`${key}b${i++}`}>{m[1]}</strong> : <a key={`${key}a${i++}`} href={m[3]} style={{ color: 'var(--accent)' }} rel="noopener noreferrer">{m[2]}</a>); last = m.index + m[0].length; }
  if (last < t.length) out.push(t.slice(last)); return out;
};
/** A small, safe Markdown renderer: headings, paragraphs, lists, bold, http(s) links. No raw HTML. */
export function renderMarkdown(md: string): ReactNode[] {
  const blocks: ReactNode[] = []; let para: string[] = [], list: string[] = [], k = 0;
  const flush = () => { if (para.length) { blocks.push(<p key={k++}>{inline(para.join(' '), String(k))}</p>); para = []; } if (list.length) { blocks.push(<ul key={k++} style={{ paddingLeft: 20 }}>{list.map((l, i) => <li key={i}>{inline(l, `${k}-${i}`)}</li>)}</ul>); list = []; } };
  for (const line of md.split(/\r?\n/)) {
    const h = line.match(/^(#{1,3})\s+(.*)$/), li = line.match(/^\s*[-*]\s+(.*)$/);
    if (h) { flush(); const L = h[1].length; blocks.push(L === 1 ? <h1 key={k++} style={{ fontSize: 28, letterSpacing: '-.02em', color: 'var(--text-primary)' }}>{h[2]}</h1> : <h2 key={k++}>{h[2]}</h2>); }
    else if (li) { if (para.length) flush(); list.push(li[1]); }
    else if (!line.trim()) flush(); else { if (list.length) flush(); para.push(line.trim()); }
  }
  flush(); return blocks;
}
