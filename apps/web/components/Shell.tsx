'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  PenLine, Home, MessageCircle, Compass, User, Settings, Shuffle, Sparkles, Link2, Plus, X
} from 'lucide-react';
import { themeIds } from '@inkognito/core';
import { useTheme } from './ThemeProvider';
import { ConnectionBanner } from './ConnectionBanner';

const desk = [
  ['/void', 'Void', Home],
  ['/discover', 'Discover', Compass],
  ['/random', 'Random', Shuffle],
  ['/messages', 'Whispers', MessageCircle],
  ['/ai', 'AI Companion', Sparkles],
  ['/anon/create', 'Anon Inbox', Link2],
  ['/create', 'Create', PenLine],
  ['/me', 'Me', User],
  ['/settings', 'Settings', Settings],
] as const;

const hubItems = [
  { href: '/create', label: 'Create Post', desc: 'Share what you can’t say', icon: PenLine, accent: true },
  { href: '/anon/create', label: 'Anon Inbox', desc: 'Get your secret Q&A link', icon: Link2 },
  { href: '/ai', label: 'AI Companion', desc: 'Safe, private reflection', icon: Sparkles },
  { href: '/messages', label: 'Whispers', desc: 'Encrypted direct replies', icon: MessageCircle },
  { href: '/settings', label: 'Settings', desc: 'Themes & privacy controls', icon: Settings },
] as const;

const label = (id: string) => id.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { theme, setTheme } = useTheme();
  const [hubOpen, setHubOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem('ink-onboarded', '1'); } catch {}
  }, []);

  // Close hub whenever user navigates
  useEffect(() => {
    setHubOpen(false);
  }, [path]);

  const cur = (h: string) => (path === h || path.startsWith(h + '/') ? 'page' : undefined);
  const isCreate = path === '/create';

  return (
    <div className="shell">
      <a className="skip" href="#main">Skip to content</a>

      {/* Desktop Sidebar */}
      <nav className="side" aria-label="Main">
        <div className="wordmark">inkognito</div>
        {desk.map(([h, l, I]) => (
          <Link key={h} href={h} aria-current={cur(h)}>
            <I size={20} />
            {l}
          </Link>
        ))}
      </nav>

      {/* Main Content Area */}
      <main id="main" className="main" tabIndex={-1}>
        <ConnectionBanner />
        {children}
      </main>

      {/* Context Sidebar (Desktop Appearance) */}
      <aside className="ctx" aria-label="Context">
        <h3 className="h">Appearance</h3>
        <div className="themes">
          {themeIds.map(t => (
            <button key={t} aria-pressed={t === theme} onClick={() => setTheme(t)}>
              {label(t)}
            </button>
          ))}
        </div>
      </aside>

      {/* Persistent Floating Create Post Button (X / Twitter style on Mobile) */}
      {!isCreate && (
        <Link
          href="/create"
          className="mobile-fab-create"
          aria-label="Create Post"
          title="Create anonymous confession"
        >
          <PenLine size={24} />
        </Link>
      )}

      {/* Mobile Feature Hub Overlay */}
      {hubOpen && (
        <div className="mobile-hub-scrim" onClick={() => setHubOpen(false)}>
          <div className="mobile-hub-card" onClick={e => e.stopPropagation()}>
            <div className="mobile-hub-header">
              <span className="mobile-hub-title">More on Inkognito</span>
              <button
                type="button"
                className="act"
                aria-label="Close"
                onClick={() => setHubOpen(false)}
                style={{ minHeight: 36, minWidth: 36, padding: 6 }}
              >
                <X size={20} />
              </button>
            </div>
            <div className="mobile-hub-grid">
              {hubItems.map(item => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`mobile-hub-item ${item.accent ? 'accent-item' : ''}`}
                    onClick={() => setHubOpen(false)}
                  >
                    <span className="mobile-hub-icon-wrap">
                      <Icon size={22} />
                    </span>
                    <div className="mobile-hub-text">
                      <div className="mobile-hub-label">{item.label}</div>
                      <div className="mobile-hub-desc">{item.desc}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar */}
      <nav className="bottom" aria-label="Main">
        {/* 1. Void */}
        <Link href="/void" aria-current={cur('/void')}>
          <Home size={22} />
          <span>Void</span>
        </Link>

        {/* 2. Discover */}
        <Link href="/discover" aria-current={cur('/discover')}>
          <Compass size={22} />
          <span>Discover</span>
        </Link>

        {/* 3. Center FAB Hub Button */}
        <button
          type="button"
          className={`mobile-center-hub ${hubOpen ? 'active' : ''}`}
          onClick={() => setHubOpen(!hubOpen)}
          aria-label="Open feature menu"
          aria-expanded={hubOpen}
        >
          <span className="hub-btn-inner">
            {hubOpen ? <X size={22} /> : <Plus size={24} />}
          </span>
          <span style={{ fontSize: 10, marginTop: 1 }}>More</span>
        </button>

        {/* 4. Random (pushed before Me!) */}
        <Link href="/random" aria-current={cur('/random')}>
          <Shuffle size={22} />
          <span>Random</span>
        </Link>

        {/* 5. Me */}
        <Link href="/me" aria-current={cur('/me')}>
          <User size={22} />
          <span>Me</span>
        </Link>
      </nav>
    </div>
  );
}
