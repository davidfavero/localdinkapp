
import { getApps, initializeApp, cert, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function getCredential() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (json) {
    const parsed = JSON.parse(json);
    // This is the critical fix: Correctly format the private key.
    if (typeof parsed.private_key === 'string') {
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }
    return cert(parsed);
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;
  
  if (projectId && clientEmail && privateKeyRaw) {
    const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
    return cert({ projectId, clientEmail, privateKey });
  }

  const b64 = process.env.FIREBASE_PRIVATE_KEY_B64;
  if (projectId && clientEmail && b64) {
    return cert({
      projectId,
      clientEmail,
      privateKey: Buffer.from(b64, 'base64').toString('utf8'),
    });
  }

  throw new Error(
    'Missing service account envs. Provide FIREBASE_SERVICE_ACCOUNT or FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY.'
  );
}

const adminApp = getApps().length ? getApp() : initializeApp({ credential: getCredential() });
export const adminDb = getFirestore(adminApp);
