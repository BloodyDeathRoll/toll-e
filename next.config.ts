import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Site-wide response headers (swarm audit 2026-09-11). No CSP yet — next-intl
// and the inline theme script need nonces/hashes first; see the audit's
// proposals. Nothing in the app needs camera, microphone, geolocation or payment.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

const nextConfig: NextConfig = {
  // Let phones on the LAN load dev-server assets (design review on-device).
  allowedDevOrigins: ['192.168.1.133', '192.168.1.*'],
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
