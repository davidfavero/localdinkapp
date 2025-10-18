
import { getApps, initializeApp, cert, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function getCredential() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (json) {
    const parsed = JSON.parse(json);
    if (typeof parsed.private_key === 'string') {
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }
    return cert(parsed as any);
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  let privateKey: string | undefined;
  const b64 = process.env.FIREBASE_PRIVATE_KEY_B64?.trim();
  if (b64) privateKey = Buffer.from(b64, 'base64').toString('utf8');
  else if (process.env.FIREBASE_PRIVATE_KEY)
    privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey)
    throw new Error('Missing Firebase Admin envs.');

  return cert({ projectId, clientEmail, privateKey });
}

const adminApp = getApps().length ? getApp() : initializeApp({ credential: getCredential() });
export const adminDb = getFirestore(adminApp);
