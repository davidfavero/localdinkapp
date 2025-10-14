import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';

// This function now throws an error if the value is missing or a placeholder.
function must(name: string): string {
  const envName = name;
  const v = process.env[envName];
  if (!v || v.trim().length < 10 || v.includes('YOUR_')) {
    throw new Error(`Missing or placeholder ${envName}. Please set it in your .env.local file.`);
  }
  return v;
}

export const firebaseConfig = {
  apiKey: must('NEXT_PUBLIC_FB_API_KEY'),
  authDomain: must('NEXT_PUBLIC_FB_AUTH_DOMAIN'),
  projectId: must('NEXT_PUBLIC_FB_PROJECT_ID'),
  storageBucket: process.env.NEXT_PUBLIC_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FB_MESSAGING_SENDER_ID,
  appId: must('NEXT_PUBLIC_FB_APP_ID'),
};

// Initialize Firebase.
// This will now throw an error during the build if the config is invalid.
export const app: FirebaseApp = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);
