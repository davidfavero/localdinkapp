// SERVER-ONLY. Never import this from a 'use client' file.
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function fromEnv() {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (sa) {
    let parsed: any;
    try { parsed = JSON.parse(sa); }
    catch { throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON'); }

    for (const k of ['project_id', 'client_email', 'private_key']) {
      if (!parsed[k]) throw new Error(`FIREBASE_SERVICE_ACCOUNT missing ${k}`);
    }
    if (typeof parsed.private_key === 'string' && parsed.private_key.includes('\\n')) {
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }
    return cert({
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key,
    });
  }

  const projectId   = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let   privateKey  = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Missing service account envs. Provide FIREBASE_SERVICE_ACCOUNT ' +
      'or FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY.'
    );
  }

  if (privateKey.includes('\\n')) privateKey = privateKey.replace(/\\n/g, '\n');
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) privateKey = privateKey.slice(1, -1);

  return cert({ projectId, clientEmail, privateKey });
}

// helpful server log
console.log('[admin] initializing with service-account credential');

const app = getApps()[0] ?? initializeApp({ credential: fromEnv() });
export const adminDb = getFirestore(app);