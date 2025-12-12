'use client';

// src/firebase/app.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';

// Guard that works with literal values (no dynamic indexing)
function mustLiteral(v: string | undefined, name: string): string {
  if (!v || v.trim().length < 6 || v.includes('YOUR_')) {
    throw new Error(`Missing or placeholder ${name}. Please set it in your .env.local file.`);
  }
  return v;
}

function getClientConfig() {
  return {
    apiKey: mustLiteral(process.env.NEXT_PUBLIC_FB_API_KEY as string, 'NEXT_PUBLIC_FB_API_KEY'),
    authDomain: mustLiteral(process.env.NEXT_PUBLIC_FB_AUTH_DOMAIN as string, 'NEXT_PUBLIC_FB_AUTH_DOMAIN'),
    projectId: mustLiteral(process.env.NEXT_PUBLIC_FB_PROJECT_ID as string, 'NEXT_PUBLIC_FB_PROJECT_ID'),
    appId: mustLiteral(process.env.NEXT_PUBLIC_FB_APP_ID as string, 'NEXT_PUBLIC_FB_APP_ID'),
    // Use BUCKET NAME, e.g. localdinkapp.appspot.com
    storageBucket: process.env.NEXT_PUBLIC_FB_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FB_MESSAGING_SENDER_ID,
  };
}

// Lazily create (or return) the singleton app to avoid races
let firebaseApp: FirebaseApp | null = null;

function assertClientEnvironment() {
  if (typeof window === 'undefined') {
    throw new Error(
      'Firebase client SDK cannot be initialized on the server. Call getClientApp() from client components or effects only.'
    );
  }
}

export function getClientApp(): FirebaseApp {
  assertClientEnvironment();

  if (firebaseApp) {
    return firebaseApp;
  }

  try {
    const clientConfig = getClientConfig();
    firebaseApp = getApps().length ? getApp() : initializeApp(clientConfig);
    return firebaseApp;
  } catch (error) {
    // Clear the cached app instance on error so we can retry
    firebaseApp = null;
    if (error instanceof Error) {
      // Re-throw with more context
      throw new Error(
        `Failed to initialize Firebase: ${error.message}. ` +
        `Please ensure all NEXT_PUBLIC_FB_* environment variables are set correctly in your Firebase App Hosting configuration.`
      );
    }
    throw error;
  }
}
