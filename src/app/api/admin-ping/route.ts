export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAdminDb, getLastInitError } from '@/firebase/admin';

export async function GET() {
  try {
    const adminDb = await getAdminDb();
    
    if (!adminDb) {
      let saError = null;
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
          const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
          const missing = [];
          if (!parsed.project_id && !parsed.projectId) missing.push('project_id');
          if (!parsed.client_email && !parsed.clientEmail) missing.push('client_email');
          if (!parsed.private_key && !parsed.privateKey) missing.push('private_key');
          if (missing.length > 0) {
            saError = `Missing fields in FIREBASE_SERVICE_ACCOUNT: ${missing.join(', ')}`;
          }
        } catch (e) {
          saError = e instanceof Error ? e.message : 'Invalid JSON in FIREBASE_SERVICE_ACCOUNT';
        }
      }
      
      const initError = getLastInitError();
      return NextResponse.json({
        ok: false,
        message: 'Firebase Admin SDK not initialized. Check environment variables.',
        saEnv: !!process.env.FIREBASE_SERVICE_ACCOUNT,
        saError,
        saLength: process.env.FIREBASE_SERVICE_ACCOUNT?.length ?? 0,
        pidEnv: !!process.env.FIREBASE_PROJECT_ID,
        emailEnv: !!process.env.FIREBASE_CLIENT_EMAIL,
        keyLen: (process.env.FIREBASE_PRIVATE_KEY ?? '').length,
        initError: initError ? {
          message: initError.message,
          stack: initError.stack,
        } : null,
      }, { status: 503 });
    }

    const snap = await adminDb.collection('_ping').limit(1).get();
    return NextResponse.json({
      ok: true,
      saEnv: !!process.env.FIREBASE_SERVICE_ACCOUNT,
      pidEnv: !!process.env.FIREBASE_PROJECT_ID,
      emailEnv: !!process.env.FIREBASE_CLIENT_EMAIL,
      keyLen: (process.env.FIREBASE_PRIVATE_KEY ?? '').length,
      docs: snap.size,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message ?? String(e) }, { status: 500 });
  }
}
