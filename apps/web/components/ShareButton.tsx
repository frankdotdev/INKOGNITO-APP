'use client';
import { useState } from 'react';
import { Share2, Check } from 'lucide-react';
/** Shares a link that unfurls into a card (see /s and /c). Uses the native share sheet when available, else copies the link. */
export function ShareButton({ path, title, text }: { path: string; title: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = `${window.location.origin}${path}`;
    try {
      if (navigator.share) { await navigator.share({ title, text, url }); return; }
      await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      window.prompt('Copy this link', url);
    }
  };
  return <button className="act" onClick={share} aria-label={title}>{copied ? <Check size={20} /> : <Share2 size={20} />}<span role="status">{copied ? 'Link copied' : ''}</span></button>;
}
