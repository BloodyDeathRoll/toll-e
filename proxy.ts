import createProxy from 'next-intl/middleware';
import { routing } from './src/i18n/routing';

export default createProxy(routing);

export const config = {
  // Skip api routes, Next internals, and static files.
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
};
