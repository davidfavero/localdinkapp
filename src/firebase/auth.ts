'use client';

import {
  getAuth,
  signOut,
  onAuthStateChanged,
  type User,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from 'firebase/auth';
import { getClientApp } from './app';

const app = getClientApp();
export const auth = getAuth(app);

export function onAuth(cb: (user: User | null) => void) {
  return onAuthStateChanged(auth, cb);
}

export function signOutUser() {
  return signOut(auth);
}

// SMS Authentication
let recaptchaVerifier: RecaptchaVerifier | null = null;

/**
 * Sets up an invisible reCAPTCHA verifier for phone authentication.
 * 
 * IMPORTANT: For development, you should configure test phone numbers in Firebase Console:
 * 1. Go to Firebase Console > Authentication > Settings > Phone
 * 2. Add test phone numbers (e.g., +1 555-123-4567 with code 123456)
 * 3. Test numbers bypass reCAPTCHA entirely
 * 
 * If you see a visible reCAPTCHA challenge, check:
 * - Your domain (localhost) is authorized in Firebase Console > Authentication > Settings > Authorized domains
 * - reCAPTCHA is properly configured for your Firebase project
 */
export function setupRecaptcha(containerId: string, invisible: boolean = false) {
  if (!auth) throw new Error('Auth not initialized');
  
  // Clean up existing verifier
  if (recaptchaVerifier) {
    try {
      recaptchaVerifier.clear();
    } catch (e) {
      console.log('Error clearing recaptcha:', e);
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
      // reCAPTCHA solved automatically
      console.log('reCAPTCHA verified automatically');
    },
    'expired-callback': () => {
      // Reset reCAPTCHA
      console.log('reCAPTCHA expired, will retry automatically');
      if (recaptchaVerifier) {
        try {
          recaptchaVerifier.clear();
        } catch (e) {
          console.log('Error clearing expired recaptcha:', e);
        }
        recaptchaVerifier = null;
      }
    },
    'error-callback': (error: any) => {
      // Suppress timeout errors that occur after successful verification
      if (error?.message?.includes('Timeout') || error?.message?.includes('timeout')) {
        console.log('reCAPTCHA timeout (can be safely ignored if verification succeeded)');
      } else {
        console.error('reCAPTCHA error:', error);
      }
    }
  });
  
  // Render the invisible reCAPTCHA
  recaptchaVerifier.render().then((widgetId) => {
    console.log('Invisible reCAPTCHA rendered with widget ID:', widgetId);
  }).catch((error) => {
    console.error('Error rendering reCAPTCHA:', error);
  });
  
  return recaptchaVerifier;
}

export function clearRecaptcha() {
  if (recaptchaVerifier) {
    try {
      recaptchaVerifier.clear();
    } catch (e) {
      console.log('Error clearing recaptcha:', e);
    }
    recaptchaVerifier = null;
  }
}

export async function sendSMSCode(phoneNumber: string): Promise<ConfirmationResult> {
  if (!auth) throw new Error('Auth not initialized');
  if (!recaptchaVerifier) {
    throw new Error('Recaptcha not initialized. Call setupRecaptcha first.');
  }
  
  return signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
}

export async function verifySMSCode(confirmationResult: ConfirmationResult, code: string) {
  return confirmationResult.confirm(code);
}