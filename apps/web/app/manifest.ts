import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Inkognito', short_name: 'Inkognito', description: "Say what you can't say anywhere else.",
    id: '/', scope: '/', start_url: '/', display: 'standalone', orientation: 'portrait', categories: ['social', 'lifestyle'],
    shortcuts: [{ name: 'Write something', url: '/create' }, { name: 'Meet someone', url: '/random' }], background_color: '#09090B', theme_color: '#09090B',
    icons: [
      { src: '/pwa-icon/192', sizes: '192x192', type: 'image/png' },
      { src: '/pwa-icon/512', sizes: '512x512', type: 'image/png' },
      { src: '/pwa-icon/512?maskable=1', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
