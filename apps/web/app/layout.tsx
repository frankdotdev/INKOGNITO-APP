import './globals.css';
import Script from 'next/script';
import { Manrope } from 'next/font/google';
import { themes, themeToCssVars } from '@inkognito/core';
import { ThemeProvider } from '../components/ThemeProvider';
import { ServiceWorker } from '../components/ServiceWorker';
import { InstallPrompt } from '../components/InstallPrompt';
const font = Manrope({ subsets: ['latin'], variable: '--font' });
export const metadata = { appleWebApp: { capable: true, title: 'Inkognito', statusBarStyle: 'black-translucent' as const }, icons: { apple: '/pwa-icon/180' }, metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'), title: 'Inkognito', description: "Say what you can't say anywhere else." };
export const viewport = { themeColor: '#09090B', viewportFit: 'cover' as const };
const css = Object.entries(themes).map(([id, t]) => `[data-theme="${id}"]{${Object.entries(themeToCssVars(t)).map(([k, v]) => `${k}:${v}`).join(';')}}`).join('\n');
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="obsidian" className={font.variable} suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <Script src="/theme-boot.js" strategy="beforeInteractive" />
      </head>
      <body><ThemeProvider><ServiceWorker /><InstallPrompt />{children}</ThemeProvider></body>
    </html>
  );
}
