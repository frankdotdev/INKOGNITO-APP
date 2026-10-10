import Link from 'next/link';
import { Palette, Bell, Sparkles, Fingerprint, ShieldCheck, Lock, BookOpen, ChevronRight } from 'lucide-react';
const base = [['/settings/notifications', 'Notifications', Bell], ['/settings/plus', 'Inkognito Plus and your name', Sparkles], ['/settings/identity', 'Identity, devices and recovery', Fingerprint], ['/settings/appearance', 'Appearance', Palette], ['/settings/safety', 'Safety and blocked people', ShieldCheck], ['/settings/privacy', 'Privacy and your data', Lock], ['/settings/rules', 'Community rules', BookOpen]] as const;
const legal = [...(process.env.NEXT_PUBLIC_HAS_TERMS ? [['/legal/terms', 'Terms of Service', BookOpen] as const] : []), ...(process.env.NEXT_PUBLIC_HAS_PRIVACY_POLICY ? [['/legal/privacy', 'Privacy Policy', Lock] as const] : [])];
const rows = [...base, ...legal];
export default function Settings() {
  return (<div style={{ display: 'grid', gap: 16 }}><h1 style={{ fontSize: 28, letterSpacing: '-.02em' }}>Settings</h1>
    <div>{rows.map(([h, l, I]) => <Link key={h} href={h} className="card row" style={{ minHeight: 56 }}><I size={20} /><span className="grow name">{l}</span><ChevronRight size={18} /></Link>)}</div></div>);
}
