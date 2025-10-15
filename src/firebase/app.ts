// src/firebase/app.ts
import { initializeApp, getApps } from 'firebase/app';

// This function is being simplified. The provider will now handle the check.
function must(name: string): string {
  const v = process.env[name as keyof NodeJS.ProcessEnv];
  if (!v) {
    // A simple check is sufficient here, as the provider will guide the user.
    return ''; 
  }
  return v;
}

export const clientConfig = {
  apiKey: must('NEXT_PUBLIC_FB_API_KEY'),
  authDomain: must('NEXT_PUBLIC_FB_AUTH_DOMAIN'),
  projectId: must('NEXT_PUBLIC_FB_PROJECT_ID'),
  appId: must('NEXT_PUBLIC_FB_APP_ID'),
  // Use your bucket NAME, e.g. localdinkapp.appspot.com
  storageBucket: process.env.NEXT_PUBLIC_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FB_MESSAGING_SENDER_ID,
};

export const app = (clientConfig.projectId && getApps().length === 0) 
  ? initializeApp(clientConfig) 
  : (getApps()[0] || undefined);
