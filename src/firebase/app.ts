import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';

// This function now returns the value or an empty string, and checks for placeholder values.
function getEnv(name: string): string {
  const envName = `NEXT_PUBLIC_${name}`;
  const v = process.env[envName];
  if (!v || v.includes('YOUR_')) {
    return '';
  }
  return v;
}

const firebaseConfig = {
  apiKey: getEnv('FB_API_KEY'),
  authDomain: getEnv('FB_AUTH_DOMAIN'),
  projectId: getEnv('FB_PROJECT_ID'),
  storageBucket: getEnv('FB_STORAGE_BUCKET'),
  messagingSenderId: getEnv('FB_MESSAGING_SENDER_ID'),
  appId: getEnv('FB_APP_ID'),
};

// A flag to check if the Firebase configuration is fully provided.
export const isFirebaseConfigured =
  !!firebaseConfig.apiKey &&
  !!firebaseConfig.projectId &&
  !!firebaseConfig.appId;

// Initialize Firebase only if the config is valid.
// This prevents the "missing api key" error from crashing the app.
export const app: FirebaseApp | null = isFirebaseConfigured
  ? getApps().length ? getApps()[0]! : initializeApp(firebaseConfig)
  : null;
