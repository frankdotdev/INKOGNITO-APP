'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PenLine, Home, MessageCircle, Compass, User, Settings, Shuffle, Sparkles, Link2 } from 'lucide-react';
import { themeIds } from '@inkognito/core';
import { useTheme } from './ThemeProvider';
import { ConnectionBanner } from './ConnectionBanner';
const mobile = [['/void','Void',Home],['/discover','Discover',Compass],['/random','Random',Shuffle],['/create','Create',PenLine],['/me','Me',User]] as const;
const desk = [['/void','Void',Home],['/discover','Discover',Compass],['/random','Random',Shuffle],['/messages','Whispers',MessageCircle],['/ai','AI Companion',Sparkles],['/anon/create','Anon Inbox',Link2],['/create','Create',PenLine],['/me','Me',User],['/settings','Settings',Settings]] as const;
const label = (id: string) => id.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname(); const { theme, setTheme } = useTheme();
  useEffect(() => { try { localStorage.setItem('ink-onboarded', '1'); } catch {} }, []);
  const cur = (h: string) => (path === h || path.startsWith(h + '/') ? 'page' : undefined);
  return (
    <div className="shell">
      <a className="skip" href="#main">Skip to content</a>
      <nav className="side" aria-label="Main">
        <div className="wordmark">inkognito</div>
        {desk.map(([h, l, I]) => <Link key={h} href={h} aria-current={cur(h)}><I size={20} />{l}</Link>)}
      </nav>
      <main id="main" className="main" tabIndex={-1}><ConnectionBanner />{children}</main>
      <aside className="ctx" aria-label="Context">
        <h3 className="h">Appearance</h3>
        <div className="themes">{themeIds.map(t => <button key={t} aria-pressed={t === theme} onClick={() => setTheme(t)}>{label(t)}</button>)}</div>
      </aside>
      <nav className="bottom" aria-label="Main">
        {mobile.map(([h, l, I]) => <Link key={h} href={h} aria-current={cur(h)} className={h === '/create' ? 'create' : ''}><I size={22} />{l}</Link>)}
      </nav>
    </div>
  );
}
