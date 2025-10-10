// Node-only: install firebase-admin
// pnpm add firebase-admin
import { getApps, initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const app = getApps().length
  ? getApps()[0]
  : initializeApp({
      credential:
        process.env.FIREBASE_SERVICE_ACCOUNT
          ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) // from JSON env var
          : applicationDefault(), // works on Firebase-hosted or local gcloud
    });

export const adminDb = getFirestore(app);
