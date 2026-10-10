import Link from 'next/link';
import { FileText, MessageSquare, Repeat2, Bookmark, Activity, MessageCircle, ChevronRight, Settings, Sparkles } from 'lucide-react';
const rows = [['/me/confessions', 'My confessions', FileText], ['/me/comments', 'My comments', MessageSquare], ['/me/echoes', 'My Echoes', Repeat2], ['/me/saved', 'Saved', Bookmark], ['/me/activity', 'Activity', Activity], ['/messages', 'Whispers', MessageCircle], ['/ai', 'AI Companion', Sparkles], ['/settings', 'Settings', Settings]] as const;
import { Standing } from '../../../components/Standing';
export default function Me() {
  return (<div style={{ display: 'grid', gap: 16 }}>
    <h1 style={{ fontSize: 28, letterSpacing: '-.02em' }}>My Inkognito</h1>
    <p className="meta">Only you can see this. Nothing here is public.</p>
    <Standing />
    <div>{rows.map(([h, l, I]) => <Link key={h} href={h} className="card row" style={{ minHeight: 56 }}><I size={20} /><span className="grow name">{l}</span><ChevronRight size={18} /></Link>)}</div>
  </div>);
}
