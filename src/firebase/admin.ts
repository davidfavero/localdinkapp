// src/firebase/admin.ts
import { getApps, initializeApp, cert, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function getCredential() {
  // Option A: single JSON blob
  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (json) {
    try {
        const parsed = JSON.parse(json);
        return cert(parsed);
    } catch (e) {
        console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:", e);
        throw new Error("Invalid format for FIREBASE_SERVICE_ACCOUNT. It must be a valid JSON string.");
    }
  }

  // Option B: split envs
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // handle escaped newlines when stored in .env or Vercel
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Missing service account envs. Provide FIREBASE_SERVICE_ACCOUNT or FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY.'
    );
  }
  return cert({ projectId, clientEmail, privateKey });
}

const adminApp = getApps().length
  ? getApp()
  : initializeApp({ credential: getCredential() });

export const adminDb = getFirestore(adminApp);
