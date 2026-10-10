'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { themeIds, type ThemeId } from '@inkognito/core';
type Ctx = { theme: ThemeId; setTheme: (t: ThemeId) => void; reduceMotion: boolean; setReduceMotion: (v: boolean) => void };
const C = createContext<Ctx>({ theme: 'obsidian', setTheme: () => {}, reduceMotion: false, setReduceMotion: () => {} });
export const useTheme = () => useContext(C);
const save = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} };
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>('obsidian'); const [reduceMotion, setRM] = useState(false);
  useEffect(() => { const d = document.documentElement.dataset; if (themeIds.includes(d.theme as ThemeId)) setThemeState(d.theme as ThemeId); setRM(d.motion === 'reduce'); }, []);
  const setTheme = (t: ThemeId) => { setThemeState(t); document.documentElement.dataset.theme = t; save('ink-theme', t); };
  const setReduceMotion = (v: boolean) => { setRM(v); document.documentElement.dataset.motion = v ? 'reduce' : ''; save('ink-motion', v ? 'reduce' : ''); };
  return <C.Provider value={{ theme, setTheme, reduceMotion, setReduceMotion }}>{children}</C.Provider>;
}
