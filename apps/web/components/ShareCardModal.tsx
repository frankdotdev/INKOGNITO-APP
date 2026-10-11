'use client';
import { useEffect, useRef, useState } from 'react';
import { X, Sparkles, Copy, Download, Share2, Check, ExternalLink } from 'lucide-react';
import type { Post } from '@inkognito/core';

export type CardTheme = 'sunset' | 'neon' | 'obsidian' | 'rose' | 'forest';
export type CardLayout = 'square' | 'story';

const THEMES: Record<CardTheme, { name: string; bg1: string; bg2: string; cardBg: string; text: string; sub: string; accent: string }> = {
  sunset: {
    name: 'Sunset',
    bg1: '#1a0b08',
    bg2: '#3d1608',
    cardBg: 'rgba(255, 110, 50, 0.08)',
    text: '#fff1ec',
    sub: '#ff9d76',
    accent: '#ff5c26',
  },
  neon: {
    name: 'Neon',
    bg1: '#070b19',
    bg2: '#1b1238',
    cardBg: 'rgba(130, 80, 255, 0.12)',
    text: '#f2f0ff',
    sub: '#9d88ff',
    accent: '#8b5cf6',
  },
  obsidian: {
    name: 'Obsidian',
    bg1: '#0a0a0c',
    bg2: '#141419',
    cardBg: 'rgba(255, 255, 255, 0.05)',
    text: '#f5f5f7',
    sub: '#8a8d98',
    accent: '#64748b',
  },
  rose: {
    name: 'Rose',
    bg1: '#18080f',
    bg2: '#330f1c',
    cardBg: 'rgba(255, 60, 120, 0.1)',
    text: '#fff0f4',
    sub: '#ff85a8',
    accent: '#f43f5e',
  },
  forest: {
    name: 'Forest',
    bg1: '#06120e',
    bg2: '#0e261d',
    cardBg: 'rgba(50, 200, 140, 0.09)',
    text: '#ecfdf5',
    sub: '#6ee7b7',
    accent: '#10b981',
  },
};

export function ShareCardModal({ post, onClose }: { post: Post; onClose: () => void }) {
  const [layout, setLayout] = useState<CardLayout>('square');
  const [theme, setTheme] = useState<CardTheme>('sunset');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPic, setCopiedPic] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const postUrl = typeof window !== 'undefined' ? `${window.location.origin}/post/${post.id}` : '';

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

    const words = `“${post.body.trim()}”`.split(' ');
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
    ctx.fillText('inkognito · say what you can’t say', cardX + cardW - 56, cardY + cardH - 65);
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

  const getBlob = (): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      canvasRef.current?.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas blob failed'));
      }, 'image/png');
    });
  };

  const handleShareNative = async () => {
    setSharing(true);
    try {
      const blob = await getBlob();
      const file = new File([blob], `inkognito-${post.id}.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: 'Inkognito Confession',
          text: `"${post.body.slice(0, 100)}..."\n\nRead more on Inkognito:`,
          url: postUrl,
          files: [file],
        });
      } else if (navigator.share) {
        await navigator.share({
          title: 'Inkognito Confession',
          text: `"${post.body.slice(0, 100)}..."`,
          url: postUrl,
        });
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

  const shareToWhatsapp = () => {
    const text = encodeURIComponent(`"${post.body.slice(0, 140)}"\n\nRead more anonymously on Inkognito:\n${postUrl}`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  const shareToTwitter = () => {
    const text = encodeURIComponent(`"${post.body.slice(0, 180)}"\n\nvia @inkognito\n${postUrl}`);
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
  };

  const shareToTelegram = () => {
    const text = encodeURIComponent(`"${post.body.slice(0, 140)}"`);
    window.open(`https://t.me/share/url?url=${encodeURIComponent(postUrl)}&text=${text}`, '_blank');
  };

  return (
    <div className="scrim" style={{ zIndex: 90, padding: 12, overflowY: 'auto' }} onClick={onClose}>
      <div
        className="dialog"
        style={{
          width: 'min(520px, 96vw)',
          maxHeight: '92vh',
          overflowY: 'auto',
          background: '#121417',
          border: '1px solid #272b31',
          borderRadius: 20,
          padding: '20px 18px',
          boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f5f5f7', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={18} style={{ color: 'var(--accent)' }} /> Share Post as Card
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Custom branded visual card for other apps</p>
          </div>
          <button className="act" onClick={onClose} aria-label="Close" style={{ padding: 6 }}>
            <X size={20} />
          </button>
        </div>

        {/* Layout & Theme Selectors */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          {/* Layout Selector */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '.06em', marginBottom: 6 }}>
              Layout
            </div>
            <div style={{ display: 'flex', gap: 4, background: '#1a1d21', padding: 3, borderRadius: 10, border: '1px solid #272b31' }}>
              <button
                type="button"
                onClick={() => setLayout('story')}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 7,
                  background: layout === 'story' ? '#272b31' : 'transparent',
                  color: layout === 'story' ? '#fff' : 'var(--text-muted)',
                  textAlign: 'center',
                }}
              >
                Story (9:16)
              </button>
              <button
                type="button"
                onClick={() => setLayout('square')}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 7,
                  background: layout === 'square' ? '#272b31' : 'transparent',
                  color: layout === 'square' ? '#fff' : 'var(--text-muted)',
                  textAlign: 'center',
                }}
              >
                Square (1:1)
              </button>
            </div>
          </div>

          {/* Theme Selector */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '.06em', marginBottom: 6 }}>
              Theme
            </div>
            <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2 }}>
              {(Object.keys(THEMES) as CardTheme[]).map(key => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTheme(key)}
                  style={{
                    padding: '5px 9px',
                    fontSize: 11,
                    fontWeight: 700,
                    borderRadius: 8,
                    background: theme === key ? THEMES[key].accent : '#1a1d21',
                    color: theme === key ? '#fff' : 'var(--text-muted)',
                    border: '1px solid',
                    borderColor: theme === key ? THEMES[key].accent : '#272b31',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {THEMES[key].name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Live Card Preview */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            background: '#090a0c',
            borderRadius: 14,
            padding: 12,
            border: '1px solid #1f2328',
            marginBottom: 16,
            maxHeight: 280,
            overflow: 'hidden',
          }}
        >
          {previewUrl && (
            <img
              src={previewUrl}
              alt="Card Preview"
              style={{
                maxHeight: 256,
                maxWidth: '100%',
                objectFit: 'contain',
                borderRadius: 10,
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              }}
            />
          )}
        </div>

        {/* Highlight notification */}
        <div
          style={{
            background: 'rgba(255, 92, 38, 0.12)',
            border: '1px solid rgba(255, 92, 38, 0.25)',
            borderRadius: 10,
            padding: '8px 12px',
            fontSize: 12,
            color: '#ff9d76',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 14,
          }}
        >
          <Sparkles size={16} /> Shares as high-res Image Card (not a plain link) to WhatsApp, Instagram & X!
        </div>

        {/* Primary CTA: Send to WhatsApp / Any App */}
        <button
          type="button"
          onClick={handleShareNative}
          disabled={sharing}
          style={{
            width: '100%',
            padding: '12px 16px',
            fontSize: 14,
            fontWeight: 700,
            color: '#fff',
            background: 'linear-gradient(135deg, #f43f5e 0%, #ff5c26 100%)',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            marginBottom: 10,
            cursor: 'pointer',
            border: 0,
            boxShadow: '0 6px 20px rgba(244, 63, 94, 0.35)',
          }}
        >
          <Share2 size={18} /> Send Image Card to WhatsApp / Any App
        </button>

        {/* Second Row: Copy Picture & Save to Photos */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
          <button
            type="button"
            className="btn"
            onClick={handleCopyPic}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 12px', fontSize: 13 }}
          >
            {copiedPic ? <Check size={16} style={{ color: 'var(--accent)' }} /> : <Copy size={16} />}
            {copiedPic ? 'Picture Copied!' : 'Copy Picture'}
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleDownload}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 12px', fontSize: 13 }}
          >
            <Download size={16} /> Save to Photos
          </button>
        </div>

        {/* Quick Social Links */}
        <div style={{ borderTop: '1px solid #1f2328', paddingTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '.06em', marginBottom: 8 }}>
            Share Link Directly:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
            <button
              type="button"
              className="btn sm"
              onClick={shareToWhatsapp}
              style={{ background: 'rgba(37, 211, 102, 0.15)', color: '#25d366', borderColor: 'rgba(37, 211, 102, 0.3)' }}
            >
              WhatsApp
            </button>
            <button
              type="button"
              className="btn sm"
              onClick={shareToTwitter}
              style={{ background: 'rgba(29, 155, 240, 0.15)', color: '#1d9bf0', borderColor: 'rgba(29, 155, 240, 0.3)' }}
            >
              X / Twitter
            </button>
            <button
              type="button"
              className="btn sm"
              onClick={shareToTelegram}
              style={{ background: 'rgba(0, 136, 204, 0.15)', color: '#0088cc', borderColor: 'rgba(0, 136, 204, 0.3)' }}
            >
              Telegram
            </button>
          </div>
          <button
            type="button"
            className="btn ghost sm"
            onClick={handleCopyLink}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12 }}
          >
            {copiedLink ? <Check size={14} /> : <ExternalLink size={14} />}
            {copiedLink ? 'Post Link Copied!' : 'Copy Direct Post Link'}
          </button>
        </div>
      </div>
    </div>
  );
}
