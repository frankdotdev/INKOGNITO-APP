import type { MetadataRoute } from 'next';
export default function robots(): MetadataRoute.Robots {
  const host = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/welcome', '/legal/', '/offline'],
        disallow: ['/settings', '/messages', '/me', '/ai', '/create', '/link', '/random', '/void', '/post', '/discover'],
      },
    ],
    host,
  };
}
