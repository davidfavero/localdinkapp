
import { getApps, initializeApp, cert, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function getCredential() {
  // 1. Try parsing the full service account JSON from one env var.
  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (json) {
    try {
      const parsed = JSON.parse(json);
      // This is the critical fix: Correctly format the private key.
      if (typeof parsed.private_key === 'string') {
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      }
      return cert(parsed);
    } catch (e) {
      console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:", e);
      // Fall through to other methods if JSON parsing fails
    }
  }

  // 2. Try using the individual components if the full JSON isn't available.
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;
  
  if (projectId && clientEmail && privateKeyRaw) {
    const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
    return cert({ projectId, clientEmail, privateKey });
  }

  // 3. (Optional fallback) Try a Base64 encoded key.
  const b64 = process.env.FIREBASE_PRIVATE_KEY_B64;
  if (projectId && clientEmail && b64) {
    return cert({
      projectId,
      clientEmail,
      privateKey: Buffer.from(b64, 'base64').toString('utf8'),
    });
  }

  // If all methods fail, throw a clear error.
  throw new Error(
    'Missing Firebase Admin SDK credentials. Please set FIREBASE_SERVICE_ACCOUNT or the individual FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY environment variables.'
  );
}

const adminApp = getApps().length ? getApp() : initializeApp({ credential: getCredential() });
export const adminDb = getFirestore(adminApp);
