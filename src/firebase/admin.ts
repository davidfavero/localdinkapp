// Ensure Buffer is globally available BEFORE any imports
if (typeof globalThis.Buffer === 'undefined') {
  (globalThis as any).Buffer = require('buffer').Buffer;
}
if (typeof global.Buffer === 'undefined') {
  (global as any).Buffer = require('buffer').Buffer;
}

import type { App } from 'firebase-admin/app';
import type { Firestore } from 'firebase-admin/firestore';

async function getCredential() {
  const { cert } = await import('firebase-admin/app');
  
  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (json) {
    try {
      const parsed = JSON.parse(json);
      if (typeof parsed.private_key === 'string') {
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      }
      // Validate required fields
      if (!parsed.project_id && !parsed.projectId) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT JSON is missing project_id');
      }
      if (!parsed.client_email && !parsed.clientEmail) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT JSON is missing client_email');
      }
      if (!parsed.private_key && !parsed.privateKey) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT JSON is missing private_key');
      }
      return cert(parsed as any);
    } catch (error) {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT:', error);
      if (error instanceof SyntaxError) {
        console.error('The FIREBASE_SERVICE_ACCOUNT value is not valid JSON. Make sure it\'s properly formatted and escaped in your .env.local file.');
      }
      throw error;
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  let privateKey: string | undefined;
  const b64 = process.env.FIREBASE_PRIVATE_KEY_B64?.trim();
  if (b64) privateKey = Buffer.from(b64, 'base64').toString('utf8');
  else if (process.env.FIREBASE_PRIVATE_KEY)
    privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return cert({ projectId, clientEmail, privateKey });
}

let adminApp: App | null = null;
let adminDbInstance: Firestore | null = null;
let initPromise: Promise<void> | null = null;

let lastInitError: Error | null = null;

async function initializeAdmin() {
  if (initPromise) return initPromise;
  
  initPromise = (async () => {
    try {
      const credential = await getCredential();
      if (!credential) {
        console.warn('Firebase Admin credentials not available');
        lastInitError = new Error('Firebase Admin credentials not available');
        return;
      }

      const { getApps, getApp, initializeApp } = await import('firebase-admin/app');
      const { getFirestore } = await import('firebase-admin/firestore');

      adminApp = getApps().length ? getApp() : initializeApp({ credential });
      adminDbInstance = getFirestore(adminApp);
      lastInitError = null; // Clear error on success
      console.log('Firebase Admin SDK initialized successfully');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      lastInitError = err;
      console.error('Firebase Admin SDK initialization failed:', err.message);
      if (err.stack) {
        console.error(err.stack);
      }
    }
  })();

  return initPromise;
}

export function getLastInitError(): Error | null {
  return lastInitError;
}

export async function getAdminDb(): Promise<Firestore | null> {
  if (!adminDbInstance) {
    await initializeAdmin();
  }
  return adminDbInstance;
}
