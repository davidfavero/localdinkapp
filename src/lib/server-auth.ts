import { getServerUser, verifyIdToken } from '@/lib/auth-actions';
import { redirect } from 'next/navigation';

/**
 * Get the current authenticated user on the server
 * Redirects to login if not authenticated
 */
export async function requireAuth() {
  const user = await getServerUser();
  
  if (!user) {
    redirect('/login');
  }
  
  return user;
}

/**
 * Get the current authenticated user on the server (optional)
 * Returns null if not authenticated (doesn't redirect)
 */
export async function getOptionalAuth() {
  return await getServerUser();
}

