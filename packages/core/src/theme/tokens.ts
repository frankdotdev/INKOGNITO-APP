export interface ThemeTokens {
  background: string; surface: string; surfaceRaised: string; surfaceOverlay: string;
  border: string; textPrimary: string; textSecondary: string; textMuted: string;
  accent: string; accentSoft: string; danger: string; warning: string; success: string;
}
export const themeIds = ['obsidian','ember','bloodMoon','midnight','violetVoid','forestNight','monochrome'] as const;
export type ThemeId = typeof themeIds[number];

const base = { danger: '#E5484D', warning: '#E0A33A', success: '#3DAA7D' };
const text = { textPrimary: '#F4F4F5', textSecondary: '#A1A1AA', textMuted: '#71717A' };

export const themes: Record<ThemeId, ThemeTokens> = {
  obsidian:    { ...base, ...text, background:'#09090B', surface:'#111114', surfaceRaised:'#18181C', surfaceOverlay:'#202026', border:'#292930', accent:'#C2413B', accentSoft:'rgba(194,65,59,.14)' },
  ember:       { ...base, ...text, background:'#0C0A09', surface:'#151210', surfaceRaised:'#1E1A17', surfaceOverlay:'#27221E', border:'#332C27', accent:'#C8622B', accentSoft:'rgba(200,98,43,.14)' },
  bloodMoon:   { ...base, ...text, background:'#0A0708', surface:'#130C0E', surfaceRaised:'#1C1013', surfaceOverlay:'#26161A', border:'#34191F', accent:'#A3242D', accentSoft:'rgba(163,36,45,.16)' },
  midnight:    { ...base, ...text, background:'#07090F', surface:'#0D1119', surfaceRaised:'#131924', surfaceOverlay:'#1A2130', border:'#232C3D', accent:'#4F7CC4', accentSoft:'rgba(79,124,196,.14)' },
  violetVoid:  { ...base, ...text, background:'#09080D', surface:'#100E16', surfaceRaised:'#17141F', surfaceOverlay:'#201C2B', border:'#2B2639', accent:'#8B6BC9', accentSoft:'rgba(139,107,201,.15)' },
  forestNight: { ...base, ...text, background:'#070A08', surface:'#0D120F', surfaceRaised:'#131A16', surfaceOverlay:'#1A241E', border:'#233029', accent:'#3F9A6B', accentSoft:'rgba(63,154,107,.14)' },
  monochrome:  { ...base, ...text, background:'#080808', surface:'#101010', surfaceRaised:'#171717', surfaceOverlay:'#1F1F1F', border:'#2A2A2A', accent:'#E4E4E7', accentSoft:'rgba(228,228,231,.10)' },
};

export const space = { xs:4, sm:8, md:16, lg:24, xl:40 } as const;
export const radius = { sm:8, md:12, lg:20, xl:28, full:999 } as const;

/** Web: writes tokens as CSS variables so switching is instant. */
export function themeToCssVars(t: ThemeTokens): Record<string,string> {
  return Object.fromEntries(Object.entries(t).map(([k,v]) => [`--${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}`, v]));
}
