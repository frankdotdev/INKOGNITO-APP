import { ImageResponse } from 'next/og';
import { themes } from '@inkognito/core';
const t = themes.obsidian;
export async function GET(req: Request, { params }: { params: Promise<{ size: string }> }) {
  const n = Math.min(Math.max(parseInt((await params).size, 10) || 192, 48), 1024);
  const maskable = new URL(req.url).searchParams.has('maskable');
  return new ImageResponse(
    (<div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.background, color: t.textPrimary, fontSize: n * (maskable ? 0.42 : 0.62), fontWeight: 700 }}>
      i<span style={{ color: t.accent }}>.</span></div>), { width: n, height: n });
}
