import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Let phones on the LAN load dev-server assets (design review on-device).
  allowedDevOrigins: ['192.168.1.133', '192.168.1.*'],
};

export default withNextIntl(nextConfig);
