import 'server-only';
import { headers } from 'next/headers';
import { auth } from './auth';

/** Current session or null. Server components / route handlers only. */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** Session or throw — for routes that require auth. */
export async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error('UNAUTHORIZED');
  return session;
}
