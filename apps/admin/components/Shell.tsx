'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { canFinance, canModerate, type Role } from '../lib/api';
import { AuthGate } from './AuthGate';
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return <AuthGate>{(role: Role, signOut) => {
    const links: [string, string][] = [['/', 'Dashboard'], ...(canModerate(role) ? [['/review', 'Image review'], ['/scans', 'Image scans'], ['/reports', 'Reports'], ['/random', 'Random and private chats'], ['/posts', 'Posts']] as [string, string][] : []), ...(canFinance(role) ? [['/orders', 'Orders']] as [string, string][] : []), ...(role === 'super_admin' ? [['/audit', 'Audit log']] as [string, string][] : [])];
    return (<div className="layout"><nav className="nav" aria-label="Main"><div className="brand">Control Room</div><div className="env">{role.replace('_', ' ')}</div>
      {links.map(([h, l]) => <Link key={h} href={h} aria-current={(h === '/' ? path === '/' : path.startsWith(h)) ? 'page' : undefined}>{l}</Link>)}
      <div className="who"><button className="btn sm" onClick={signOut}>Sign out</button></div></nav><main>{children}</main></div>);
  }}</AuthGate>;
}
