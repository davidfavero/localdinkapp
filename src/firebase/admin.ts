// SERVER-ONLY. Never import this from a client component.
import { getApps, initializeApp, cert, App } from "firebase-admin/app";
import { getFirestore, Firestore, Timestamp } from "firebase-admin/firestore";

let app: App;
if (!getApps().length) {
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;

  app = initializeApp({
    credential: saJson
      ? cert(JSON.parse(saJson))
      : cert({
          projectId: process.env.FIREBASE_PROJECT_ID!,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
          privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
        }),
  });
} else {
  app = getApps()[0]!;
}

const db: Firestore = getFirestore(app);

// Export only what you need. Avoid reaching into app.options.
export const adminDb = db;
export const AdminTimestamp = Timestamp;
