import type { MetadataRoute } from 'next';

// Served at /manifest.webmanifest. Together with the service worker and HTTPS
// this is what makes the app installable at all.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'toll-e — investment tracking',
    short_name: 'toll-e',
    description: 'Investment tracking with real tax clarity for Israeli investors',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // Matches the dark theme the app boots into, so the launch splash and the
    // status bar don't flash white before the first paint.
    background_color: '#0b0b0b',
    theme_color: '#0b0b0b',
    orientation: 'portrait',
    icons: [
      // PNG first and non-negotiable: Android mints a WebAPK from these, and an
      // SVG-only set leaves it with nothing installable — no prompt, no menu entry.
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // The maskable tile is both the installed icon and Android's pre-splash mark.
      { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
