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
  const { cert, applicationDefault } = await import('firebase-admin/app');
  
  // First, try using FIREBASE_SERVICE_ACCOUNT if provided
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
      console.log('Using FIREBASE_SERVICE_ACCOUNT credential');
      return cert(parsed as any);
    } catch (error) {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT:', error);
      if (error instanceof SyntaxError) {
        console.error('The FIREBASE_SERVICE_ACCOUNT value is not valid JSON. Make sure it\'s properly formatted and escaped.');
      }
      // Don't throw - try other methods
    }
  }

  // Try individual environment variables
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FB_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey: string | undefined;
  const b64 = process.env.FIREBASE_PRIVATE_KEY_B64?.trim();
  if (b64) privateKey = Buffer.from(b64, 'base64').toString('utf8');
  else if (process.env.FIREBASE_PRIVATE_KEY)
    privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    console.log('Using individual env var credentials');
    return cert({ projectId, clientEmail, privateKey });
  }

  // In Firebase App Hosting / Cloud Run, try Application Default Credentials
  // This uses the service account attached to the Cloud Run service
  try {
    console.log('Attempting to use Application Default Credentials');
    return applicationDefault();
  } catch (adcError) {
    console.log('Application Default Credentials not available:', adcError);
  }

  // Last resort: try initializing without credentials (works in some GCP environments)
  console.log('No credentials found, will try default initialization');
  return null;
}

let adminApp: App | null = null;
let adminDbInstance: Firestore | null = null;
let initPromise: Promise<void> | null = null;

let lastInitError: Error | null = null;

async function initializeAdmin() {
  if (initPromise) return initPromise;
  
  initPromise = (async () => {
    try {
      const { getApps, getApp, initializeApp } = await import('firebase-admin/app');
      const { getFirestore } = await import('firebase-admin/firestore');

      // Check if already initialized
      if (getApps().length) {
        adminApp = getApp();
        adminDbInstance = getFirestore(adminApp);
        lastInitError = null;
        console.log('Firebase Admin SDK already initialized');
        return;
      }

      const credential = await getCredential();
      
      // Get project ID from various sources
      const projectId = process.env.FIREBASE_PROJECT_ID || 
                       process.env.NEXT_PUBLIC_FB_PROJECT_ID ||
                       process.env.GCLOUD_PROJECT ||
                       process.env.GOOGLE_CLOUD_PROJECT ||
                       'localdinkapp';

      if (credential) {
        adminApp = initializeApp({ credential, projectId });
        console.log('Firebase Admin SDK initialized with explicit credentials');
      } else {
        // In Cloud Run / App Hosting, try initializing without explicit credentials
        // The default service account will be used
        console.log('Attempting to initialize Firebase Admin with default credentials for project:', projectId);
        adminApp = initializeApp({ projectId });
        console.log('Firebase Admin SDK initialized with default credentials');
      }
      
      adminDbInstance = getFirestore(adminApp);
      lastInitError = null;
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

export async function getAdminApp(): Promise<App | null> {
  if (!adminApp) {
    await initializeAdmin();
  }
  return adminApp;
}

export async function getAdminAuth() {
  const { getAuth } = await import('firebase-admin/auth');
  const app = await getAdminApp();
  if (!app) {
    throw new Error('Firebase Admin app not initialized');
  }
  return getAuth(app);
}
