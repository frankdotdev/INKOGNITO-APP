import './globals.css';
import { Shell } from '../components/Shell';
export const metadata = { title: 'Inkognito Control Room', robots: { index: false, follow: false } };
export default function Root({ children }: { children: React.ReactNode }) { return <html lang="en"><body><Shell>{children}</Shell></body></html>; }
