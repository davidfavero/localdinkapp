'use client';

import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { app } from './app';

export const auth = getAuth(app);

export async function signInWithGoogleOnly() {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
}
