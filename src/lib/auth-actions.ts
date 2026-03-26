'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAdminAuth } from '@/firebase/admin';

/**
 * Verify an ID token and return the decoded token
 */
export async function verifyIdToken(idToken: string) {
  try {
    const auth = await getAdminAuth();
    const decodedToken = await auth.verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    console.error('Error verifying ID token:', error);
    return null;
  }
}

/**
 * Get the current user from the session cookie
 */
export async function getServerUser() {
  try {
    const cookieStore = await cookies();
    const idToken = cookieStore.get('auth-token')?.value;
    
    if (!idToken) {
      return null;
    }
    
    const decodedToken = await verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    console.error('Error getting server user:', error);
    return null;
  }
}

/**
 * Set the auth token in a cookie
 */
export async function setAuthToken(idToken: string) {
  const cookieStore = await cookies();
  cookieStore.set('auth-token', idToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24, // 1 day (reduced from 7)
    path: '/',
  });
}

/**
 * Clear the auth token cookie
 */
export async function clearAuthToken() {
  const cookieStore = await cookies();
  cookieStore.delete('auth-token');
}


/**
 * Server action to set the auth token after client-side authentication
 */
export async function setAuthTokenAction(idToken: string) {
  try {
    const decodedToken = await verifyIdToken(idToken);
    if (!decodedToken) {
      console.warn('Token verification failed — rejecting token');
      return { success: false, error: 'Token verification failed' };
    }
    
    // Token is valid — set the cookie
    await setAuthToken(idToken);
    
    return { success: true };
  } catch (error: any) {
    console.error('Error setting auth token:', error);
    return { success: false, error: error.message || 'Failed to set auth token' };
  }
}

/**
 * Server action to sign out
 */
export async function signOutAction() {
  await clearAuthToken();
  redirect('/login');
}

