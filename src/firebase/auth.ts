'use client';

import '@/firebase/polyfills/local-storage.server';

import {
  getAuth,
  signOut,
  onAuthStateChanged,
  type User,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  type ConfirmationResult,
  type Auth,
  type UserCredential,
} from 'firebase/auth';
import { getClientApp } from './app';

let authInstance: Auth | null = null;

function assertClientEnvironment() {
  if (typeof window === 'undefined') {
    throw new Error('getClientAuth() is only available in the browser');
  }
}

export function getClientAuth(): Auth {
  assertClientEnvironment();

  if (authInstance) {
    return authInstance;
  }

  const app = getClientApp();
  authInstance = getAuth(app);
  return authInstance;
}

export function onAuth(cb: (user: User | null) => void, authOverride?: Auth) {
  const auth = authOverride ?? getClientAuth();
  return onAuthStateChanged(auth, cb);
}

export function signOutUser() {
  return signOut(getClientAuth());
}

// Email/Password Authentication
export async function signInWithEmail(email: string, password: string): Promise<UserCredential> {
  const auth = getClientAuth();
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signUpWithEmail(email: string, password: string): Promise<UserCredential> {
  const auth = getClientAuth();
  return createUserWithEmailAndPassword(auth, email, password);
}

// Google Sign-In
export async function signInWithGoogle(): Promise<UserCredential> {
  const auth = getClientAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    prompt: 'select_account',
  });
  return signInWithPopup(auth, provider);
}

// SMS Authentication
let recaptchaVerifier: RecaptchaVerifier | null = null;

/**
 * Sets up an invisible reCAPTCHA verifier for phone authentication.
 */
export function setupRecaptcha(containerId: string): RecaptchaVerifier {
  const auth = getClientAuth();
  
  // Clean up existing verifier
  if (recaptchaVerifier) {
    try {
      recaptchaVerifier.clear();
    } catch (e) {
      // Ignore cleanup errors
    }
    recaptchaVerifier = null;
  }
  
  // Verify container exists
  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error(`reCAPTCHA container with id "${containerId}" not found`);
  }
  
  recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
    size: 'invisible',
    callback: () => {
      console.log('reCAPTCHA verified');
    },
    'expired-callback': () => {
      console.log('reCAPTCHA expired');
      if (recaptchaVerifier) {
        try {
          recaptchaVerifier.clear();
        } catch (e) {
          // Ignore
        }
        recaptchaVerifier = null;
      }
    },
    'error-callback': (error: any) => {
      if (!error?.message?.includes('Timeout') && !error?.message?.includes('timeout')) {
        console.error('reCAPTCHA error:', error);
      }
    }
  });
  
  recaptchaVerifier.render().catch((error) => {
    console.error('Error rendering reCAPTCHA:', error);
  });
  
  return recaptchaVerifier;
}

export function clearRecaptcha() {
  if (recaptchaVerifier) {
    try {
      recaptchaVerifier.clear();
    } catch (e) {
      // Ignore
    }
    recaptchaVerifier = null;
  }
}

export async function sendSMSCode(phoneNumber: string): Promise<ConfirmationResult> {
  const auth = getClientAuth();
  if (!recaptchaVerifier) {
    throw new Error('Recaptcha not initialized. Call setupRecaptcha first.');
  }
  
  return signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
}

export async function verifySMSCode(confirmationResult: ConfirmationResult, code: string): Promise<UserCredential> {
  return confirmationResult.confirm(code);
}

/**
 * Automatically signs in anonymously for development mode.
 * This ensures users are authenticated even when bypassing the login page.
 */
export async function signInDevUser(): Promise<User> {
  const auth = getClientAuth();
  const currentUser = auth.currentUser;
  
  // If already signed in, return the current user
  if (currentUser) {
    return currentUser;
  }
  
  // Sign in anonymously
  const userCredential = await signInAnonymously(auth);
  console.log('🔧 Dev: Signed in anonymously as', userCredential.user.uid);
  return userCredential.user;
}