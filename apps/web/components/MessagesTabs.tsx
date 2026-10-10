'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { dmEnabled } from '../lib/dmClient';
export function MessagesTabs() {
  const path = usePathname(); if (!dmEnabled) return null;
  return <div className="tabs" role="tablist"><Link role="tab" className="tab" aria-selected={!path.startsWith('/messages/dm')} href="/messages">Whispers</Link><Link role="tab" className="tab" aria-selected={path.startsWith('/messages/dm')} href="/messages/dm">Private chats</Link></div>;
}
