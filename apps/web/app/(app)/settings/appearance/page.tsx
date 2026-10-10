'use client';
import { themeIds, themes } from '@inkognito/core';
import { useTheme } from '../../../../components/ThemeProvider';
const label = (id: string) => id.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
export default function Appearance() {
  const { theme, setTheme, reduceMotion, setReduceMotion } = useTheme();
  return (<div style={{ display: 'grid', gap: 16 }}><h1 style={{ fontSize: 28, letterSpacing: '-.02em' }}>Appearance</h1>
    <div className="themes" role="group" aria-label="Theme">{themeIds.map(id => <button key={id} aria-pressed={id === theme} onClick={() => setTheme(id)} className="row">
      <span className="swatch" aria-hidden>{[themes[id].background, themes[id].surfaceRaised, themes[id].accent].map(c => <i key={c} style={{ background: c }} />)}</span>{label(id)}</button>)}</div>
    <label className="row"><input type="checkbox" checked={reduceMotion} onChange={e => setReduceMotion(e.target.checked)} /> Reduce motion</label>
    <p className="meta">Your choice is saved on this device.</p></div>);
}
