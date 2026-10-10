import { ImageResponse } from 'next/og';
import { themes } from '@inkognito/core';
const t = themes.obsidian;
export const ogSize = { width: 1200, height: 630 };
export const ogType = 'image/png';
/** The share preview card (1200x630) shown when a link is pasted into a chat or social app. */
export function renderCard(o: { name: string; body: string; meta?: string; context?: string }) {
  const text = o.body.length > 260 ? o.body.slice(0, 257).trimEnd() + '…' : o.body;
  const size = text.length > 160 ? 40 : text.length > 80 ? 50 : 62;
  const initials = o.name.split(' ').map(w => w[0]).join('').slice(0, 2);
  return new ImageResponse(
    (<div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: t.background, color: t.textPrimary, padding: 64, border: `2px solid ${t.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: 28, background: t.accentSoft, color: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, marginRight: 16 }}>{initials}</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}><div style={{ fontSize: 30, fontWeight: 700 }}>{o.name}</div>{o.meta ? <div style={{ fontSize: 22, color: t.textMuted }}>{o.meta}</div> : null}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {o.context ? <div style={{ display: 'flex', fontSize: 24, color: t.textMuted, marginBottom: 16 }}>{o.context}</div> : null}
        <div style={{ display: 'flex', fontSize: size, lineHeight: 1.25 }}>{text}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', fontSize: 36, fontWeight: 700 }}>inkognito</div>
        <div style={{ display: 'flex', fontSize: 24, color: t.accent }}>{"Say what you can't say anywhere else."}</div>
      </div>
    </div>), { ...ogSize });
}
