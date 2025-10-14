'use client';

import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, type User, onAuthStateChanged } from 'firebase/auth';
import { app } from './app';

// getAuth() will throw if the app is not initialized.
// We handle this by exporting a potentially null auth object.
export const auth = app ? getAuth(app) : null;

export async function signInWithGoogleOnly() {
  if (!auth) throw new Error("Firebase is not configured. Please check your .env file.");
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
}

export function signOutUser() {
  if (!auth) throw new Error("Firebase is not configured.");
  return signOut(auth);
}

// Wrapper for onAuthStateChanged to handle null auth
export function onAuth(cb: (user: User | null) => void) {
  if (auth) {
    return onAuthStateChanged(auth, cb);
  } else {
    // If Firebase is not configured, immediately call the callback with null user
    // and return a no-op unsubscribe function.
    cb(null);
    return () => {};
  }
}
