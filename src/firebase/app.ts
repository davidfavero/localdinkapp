// src/firebase/app.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';

// Guard that works with literal values (no dynamic indexing)
function mustLiteral(v: string | undefined, name: string): string {
  if (!v || v.trim().length < 6 || v.includes('YOUR_')) {
    throw new Error(`Missing ${name} in .env.local`);
  }
  return v;
}

export const clientConfig = {
  apiKey: mustLiteral(process.env.NEXT_PUBLIC_FB_API_KEY, 'NEXT_PUBLIC_FB_API_KEY'),
  authDomain: mustLiteral(process.env.NEXT_PUBLIC_FB_AUTH_DOMAIN, 'NEXT_PUBLIC_FB_AUTH_DOMAIN'),
  projectId: mustLiteral(process.env.NEXT_PUBLIC_FB_PROJECT_ID, 'NEXT_PUBLIC_FB_PROJECT_ID'),
  appId: mustLiteral(process.env.NEXT_PUBLIC_FB_APP_ID, 'NEXT_PUBLIC_FB_APP_ID'),
  // Use BUCKET NAME, e.g. localdinkapp.appspot.com
  storageBucket: process.env.NEXT_PUBLIC_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FB_MESSAGING_SENDER_ID,
};

// Lazily create (or return) the singleton app to avoid races
let _app: FirebaseApp | null = null;
export function getClientApp(): FirebaseApp {
  if (_app) return _app;
  _app = getApps().length ? getApp() : initializeApp(clientConfig);
  return _app;
}
