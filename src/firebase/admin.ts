// SERVER-ONLY. Never import this from a client component.
import { getApps, initializeApp, cert, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";

function buildCredential() {
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (saJson) {
    try {
      return cert(JSON.parse(saJson));
    } catch (e) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON.');
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    // ❌ Do NOT fall back to applicationDefault(); fail loudly instead
    throw new Error(
      'Missing service account envs. Provide FIREBASE_SERVICE_ACCOUNT ' +
      'or FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.'
    );
  }

  // Support both literal newlines and \n-escaped keys
  if (privateKey.includes('\\n')) privateKey = privateKey.replace(/\\n/g, '\n');

  // Some platforms add surrounding quotes—strip once if present
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1);
  }

  return cert({ projectId, clientEmail, privateKey });
}

// TEMP: prove this file is used
// eslint-disable-next-line no-console
console.log('[admin] initializing with explicit service-account credential');

const app: App =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: buildCredential(),
      });

const db: Firestore = getFirestore(app);

// Export only what you need. Avoid reaching into app.options.
export const adminDb = db;
