'use client';
import { useEffect, useRef, useState } from 'react';
import { X, Sparkles, Copy, Download, Share2, Check } from 'lucide-react';
import type { Post } from '@inkognito/core';

export type CardTheme = 'sunset' | 'neon' | 'obsidian' | 'rose' | 'forest';
export type CardLayout = 'square' | 'story';

const THEMES: Record<CardTheme, { name: string; bg1: string; bg2: string; cardBg: string; text: string; sub: string; accent: string }> = {
  sunset:   { name: 'Sunset',   bg1: '#1a0b08', bg2: '#3d1608', cardBg: 'rgba(255,110,50,0.08)',   text: '#fff1ec', sub: '#ff9d76', accent: '#ff5c26' },
  neon:     { name: 'Neon',     bg1: '#070b19', bg2: '#1b1238', cardBg: 'rgba(130,80,255,0.12)',   text: '#f2f0ff', sub: '#9d88ff', accent: '#8b5cf6' },
  obsidian: { name: 'Obsidian', bg1: '#0a0a0c', bg2: '#141419', cardBg: 'rgba(255,255,255,0.05)',  text: '#f5f5f7', sub: '#8a8d98', accent: '#64748b' },
  rose:     { name: 'Rose',     bg1: '#18080f', bg2: '#330f1c', cardBg: 'rgba(255,60,120,0.1)',    text: '#fff0f4', sub: '#ff85a8', accent: '#f43f5e' },
  forest:   { name: 'Forest',   bg1: '#06120e', bg2: '#0e261d', cardBg: 'rgba(50,200,140,0.09)',   text: '#ecfdf5', sub: '#6ee7b7', accent: '#10b981' },
};

// Social brand config — using inline SVG paths for logos
const SOCIALS = [
  {
    id: 'whatsapp', label: 'WhatsApp', color: '#25d366', bg: 'rgba(37,211,102,0.12)',
    logo: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="#25d366">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
    ),
    url: (text: string, url: string) => `https://api.whatsapp.com/send?text=${encodeURIComponent(`"${text}"\n\n${url}`)}`,
  },
  {
    id: 'x', label: 'X', color: '#fff', bg: 'rgba(255,255,255,0.08)',
    logo: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.631 5.905-5.631zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    ),
    url: (text: string, url: string) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(`"${text.slice(0, 220)}"\n\n${url}`)}`,
  },
  {
    id: 'telegram', label: 'Telegram', color: '#0088cc', bg: 'rgba(0,136,204,0.12)',
    logo: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="#0088cc">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
      </svg>
    ),
    url: (text: string, url: string) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(`"${text.slice(0, 140)}"`)}`,
  },
  {
    id: 'facebook', label: 'Facebook', color: '#1877f2', bg: 'rgba(24,119,242,0.12)',
    logo: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="#1877f2">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    ),
    url: (text: string, url: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  {
    id: 'instagram', label: 'Instagram', color: '#e1306c', bg: 'rgba(225,48,108,0.12)',
    logo: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="url(#ig)">
        <defs>
          <linearGradient id="ig" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#fd5949"/>
            <stop offset="50%" stopColor="#d6249f"/>
            <stop offset="100%" stopColor="#285aeb"/>
          </linearGradient>
        </defs>
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
      </svg>
    ),
    // Instagram doesn't support URL sharing via deep link, so we copy + open app
    url: (text: string, url: string) => `instagram://`,
    action: (text: string, url: string) => {
      navigator.clipboard?.writeText(`"${text.slice(0, 200)}" ${url}`).catch(() => {});
      window.open('https://www.instagram.com/', '_blank');
    },
  },
  {
    id: 'threads', label: 'Threads', color: '#fff', bg: 'rgba(255,255,255,0.07)',
    logo: (
      <svg width="20" height="20" viewBox="0 0 192 192" fill="#fff">
        <path d="M141.537 88.988a66.667 66.667 0 0 0-2.518-1.143c-1.482-27.307-16.403-42.94-41.457-43.1h-.34c-14.986 0-27.449 6.396-35.12 18.035l13.78 9.452c5.73-8.695 14.723-10.548 21.347-10.548h.229c8.249.053 14.474 2.452 18.503 7.129 2.932 3.405 4.893 8.111 5.864 14.05-7.314-1.244-15.224-1.626-23.68-1.14-23.82 1.371-39.134 15.264-38.105 34.568.522 9.792 5.4 18.216 13.735 23.719 7.047 4.652 16.124 6.927 25.557 6.412 12.458-.683 22.231-5.436 29.049-14.127 5.178-6.6 8.453-15.153 9.899-25.93 5.937 3.583 10.337 8.298 12.767 13.966 4.132 9.635 4.373 25.468-8.546 38.376-11.319 11.308-24.925 16.2-45.488 16.351-22.809-.169-40.06-7.484-51.275-21.742C35.236 139.966 29.808 120.682 29.605 96c.203-24.682 5.63-43.966 16.133-57.317C56.954 24.425 74.204 17.11 97.013 16.94c22.975.17 40.526 7.52 52.171 21.847 5.71 7.026 9.986 15.792 12.809 26.05l16.216-4.325c-3.44-12.68-8.977-23.618-16.586-32.709C147.036 9.998 126.051.195 97.24 0h-.254C68.414.195 47.733 10.016 33.812 29.18 21.36 46.016 14.92 69.165 14.7 96v.452c.22 26.835 6.66 49.984 19.112 66.82 13.92 19.165 34.6 28.985 63.531 29.18h.228c25.94-.17 44.226-6.969 59.15-21.875 19.723-19.708 19.117-44.464 12.647-59.677-4.686-10.93-13.553-19.791-27.831-25.892Z"/>
        <path d="M96.972 112.63c-10.27.593-20.784-4.023-21.313-13.556-.388-6.857 4.695-14.494 22.679-15.521 1.983-.114 3.929-.169 5.841-.169 6.152 0 11.917.598 17.152 1.754-.555 21.532-12.793 26.884-24.359 27.492Z"/>
      </svg>
    ),
    url: (text: string, url: string) => `https://www.threads.net/intent/post?text=${encodeURIComponent(`"${text.slice(0, 400)}" ${url}`)}`,
  },
];

export function ShareCardModal({ post, onClose }: { post: Post; onClose: () => void }) {
  const [layout, setLayout] = useState<CardLayout>('square');
  const [theme, setTheme] = useState<CardTheme>('sunset');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPic, setCopiedPic] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const postUrl = typeof window !== 'undefined' ? `${window.location.origin}/s/${post.id}` : '';

  const renderCard = () => {
    const canvas = canvasRef.current || document.createElement('canvas');
    canvasRef.current = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = 1080;
    const height = layout === 'story' ? 1920 : 1080;
    canvas.width = width;
    canvas.height = height;

    const t = THEMES[theme];

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, t.bg1);
    grad.addColorStop(1, t.bg2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Decorative ambient circles
    ctx.beginPath();
    ctx.arc(width * 0.85, height * 0.2, 360, 0, Math.PI * 2);
    ctx.fillStyle = t.cardBg;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(width * 0.15, height * 0.85, 300, 0, Math.PI * 2);
    ctx.fillStyle = t.cardBg;
    ctx.fill();

    // Central card dimensions
    const pad = 120;
    const cardW = width - pad * 2;
    const cardH = layout === 'story' ? 1050 : 780;
    const cardX = pad;
    const cardY = (height - cardH) / 2;

    // Draw frosted card container
    ctx.save();
    ctx.fillStyle = 'rgba(20, 20, 24, 0.72)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 44);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Brand tag
    ctx.font = '700 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = t.accent;
    ctx.fillText('✦  INKOGNITO', cardX + 56, cardY + 85);

    if (post.category) {
      ctx.font = '600 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = t.sub;
      ctx.fillText(`·  ${post.category.toUpperCase()}`, cardX + 265, cardY + 84);
    }

    // Wrap body text
    const maxTextW = cardW - 112;
    const textX = cardX + 56;
    const textY = cardY + 180;
    const fontSize = post.body.length > 280 ? 38 : post.body.length > 140 ? 46 : 56;
    const lineHeight = fontSize * 1.45;

    ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillStyle = t.text;

    const words = `"${post.body.trim()}"`.split(' ');
    let line = '';
    let currentY = textY;
    const maxLines = layout === 'story' ? 14 : 8;
    let linesCount = 0;

    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i] + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxTextW && i > 0) {
        if (linesCount >= maxLines - 1 && i < words.length - 1) {
          ctx.fillText(line.trim() + '…', textX, currentY);
          linesCount++;
          break;
        }
        ctx.fillText(line.trim(), textX, currentY);
        line = words[i] + ' ';
        currentY += lineHeight;
        linesCount++;
      } else {
        line = testLine;
      }
    }
    if (line && linesCount < maxLines) {
      ctx.fillText(line.trim(), textX, currentY);
    }

    // Author signoff
    ctx.font = '600 30px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = t.sub;
    ctx.fillText(`by ${post.author.name}`, textX, cardY + cardH - 65);

    // Platform watermark inside card
    ctx.font = '500 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.textAlign = 'right';
    ctx.fillText("inkognito · say what you can't say", cardX + cardW - 56, cardY + cardH - 65);
    ctx.textAlign = 'left';

    // Outer footer for story layout
    if (layout === 'story') {
      ctx.textAlign = 'center';
      ctx.font = '600 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fillText('Read & speak anonymously on inkognito', width / 2, height - 120);
      ctx.textAlign = 'left';
    }

    setPreviewUrl(canvas.toDataURL('image/png'));
  };

  useEffect(() => {
    renderCard();
  }, [layout, theme, post]);

  const getBlob = (): Promise<Blob> =>
    new Promise((resolve, reject) => {
      canvasRef.current?.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas blob failed'));
      }, 'image/png');
    });

  const handleShareNative = async () => {
    setSharing(true);
    try {
      const blob = await getBlob();
      const file = new File([blob], `inkognito-${post.id}.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: 'Inkognito Confession', text: `"${post.body.slice(0, 100)}…"`, url: postUrl, files: [file] });
      } else if (navigator.share) {
        await navigator.share({ title: 'Inkognito Confession', text: `"${post.body.slice(0, 100)}…"`, url: postUrl });
      } else {
        handleDownload();
      }
    } catch {}
    setSharing(false);
  };

  const handleCopyPic = async () => {
    try {
      const blob = await getBlob();
      if (navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setCopiedPic(true);
        setTimeout(() => setCopiedPic(false), 2500);
      } else {
        handleDownload();
      }
    } catch {
      handleDownload();
    }
  };

  const handleDownload = async () => {
    try {
      const blob = await getBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inkognito-${layout}-${post.id.slice(0, 8)}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(postUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      window.prompt('Copy post link:', postUrl);
    }
  };

  return (
    <div className="scrim" style={{ zIndex: 90, padding: 12, overflowY: 'auto' }} onClick={onClose}>
      <div
        className="dialog"
        style={{ width: 'min(540px, 96vw)', maxHeight: '92vh', overflowY: 'auto', background: '#121417', border: '1px solid #272b31', borderRadius: 20, padding: '20px 18px', boxShadow: '0 24px 60px rgba(0,0,0,0.7)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f5f5f7', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={18} style={{ color: 'var(--accent)' }} /> Share Post
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Share as link with full preview, or as a visual image card</p>
          </div>
          <button className="act" onClick={onClose} aria-label="Close" style={{ padding: 6 }}><X size={20} /></button>
        </div>

        {/* ── SECTION 1: Share as Link (with preview) ── */}
        <div style={{ background: '#1a1d21', borderRadius: 14, padding: '14px 16px', marginBottom: 14, border: '1px solid #272b31' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '.06em', marginBottom: 10 }}>
            Share link — shows full post preview
          </div>

          {/* Link preview card */}
          <div style={{ background: '#0e1014', borderRadius: 10, padding: '10px 12px', marginBottom: 10, border: '1px solid #1f2328' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>inkognito.app / s / {post.id.slice(0, 8)}…</div>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#f5f5f7', marginBottom: 3 }}>{post.author.name} on Inkognito</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {post.body.slice(0, 160)}{post.body.length > 160 ? '…' : ''}
            </div>
          </div>

          {/* Primary share-link CTA */}
          <button
            type="button"
            onClick={() => {
              if (navigator.share) navigator.share({ title: `${post.author.name} on Inkognito`, text: post.body.slice(0, 140), url: postUrl }).catch(() => {});
              else handleCopyLink();
            }}
            style={{ width: '100%', padding: '10px', fontSize: 14, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10, border: 0, cursor: 'pointer' }}
          >
            <Share2 size={16} /> Share link
          </button>

          {/* Social logos row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
            {SOCIALS.map(s => (
              <button
                key={s.id}
                type="button"
                title={s.label}
                onClick={() => {
                  if (s.action) { s.action(post.body, postUrl); }
                  else { window.open(s.url(post.body, postUrl), '_blank'); }
                }}
                style={{ background: s.bg, border: `1px solid ${s.color}22`, borderRadius: 10, padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', aspectRatio: '1' }}
                aria-label={`Share to ${s.label}`}
              >
                {s.logo}
              </button>
            ))}
          </div>
        </div>

        {/* Copy link button */}
        <button
          type="button"
          onClick={handleCopyLink}
          style={{ width: '100%', padding: '8px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', background: 'transparent', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 16, border: '1px solid #272b31', cursor: 'pointer' }}
        >
          {copiedLink ? <Check size={14} style={{ color: '#10b981' }} /> : <Copy size={14} />}
          {copiedLink ? 'Copied!' : 'Copy link'}
        </button>

        {/* ── SECTION 2: Save as Image Card ── */}
        <div style={{ borderTop: '1px solid #272b31', paddingTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '.06em', marginBottom: 12 }}>
            Save as visual image card
          </div>

          {/* Layout & Theme Selectors */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 5 }}>Layout</div>
              <div style={{ display: 'flex', gap: 4, background: '#1a1d21', padding: 3, borderRadius: 10, border: '1px solid #272b31' }}>
                {(['story', 'square'] as CardLayout[]).map(l => (
                  <button key={l} type="button" onClick={() => setLayout(l)}
                    style={{ flex: 1, padding: '5px 6px', fontSize: 11, fontWeight: 600, borderRadius: 7, background: layout === l ? '#272b31' : 'transparent', color: layout === l ? '#fff' : 'var(--text-muted)', textAlign: 'center' }}>
                    {l === 'story' ? 'Story 9:16' : 'Square 1:1'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 5 }}>Theme</div>
              <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2 }}>
                {(Object.keys(THEMES) as CardTheme[]).map(key => (
                  <button key={key} type="button" onClick={() => setTheme(key)}
                    style={{ padding: '4px 8px', fontSize: 11, fontWeight: 700, borderRadius: 8, background: theme === key ? THEMES[key].accent : '#1a1d21', color: theme === key ? '#fff' : 'var(--text-muted)', border: '1px solid', borderColor: theme === key ? THEMES[key].accent : '#272b31', whiteSpace: 'nowrap' }}>
                    {THEMES[key].name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Card Preview */}
          <div style={{ display: 'flex', justifyContent: 'center', background: '#090a0c', borderRadius: 12, padding: 10, border: '1px solid #1f2328', marginBottom: 12, maxHeight: 220, overflow: 'hidden' }}>
            {previewUrl && <img src={previewUrl} alt="Card Preview" style={{ maxHeight: 200, maxWidth: '100%', objectFit: 'contain', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }} />}
          </div>

          {/* Image save actions */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <button type="button" className="btn" onClick={handleCopyPic}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', fontSize: 13 }}>
              {copiedPic ? <Check size={15} style={{ color: '#10b981' }} /> : <Copy size={15} />}
              {copiedPic ? 'Copied!' : 'Copy image'}
            </button>
            <button type="button" className="btn" onClick={handleDownload}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', fontSize: 13 }}>
              <Download size={15} /> Save to device
            </button>
          </div>
          <button type="button" onClick={handleShareNative} disabled={sharing}
            style={{ width: '100%', padding: '9px', fontSize: 13, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg, #f43f5e 0%, #ff5c26 100%)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: 0, cursor: 'pointer', boxShadow: '0 4px 16px rgba(244,63,94,0.3)' }}>
            <Share2 size={15} /> Send image to WhatsApp / any app
          </button>
        </div>
      </div>
    </div>
  );
}
