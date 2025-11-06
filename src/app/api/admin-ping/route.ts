export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAdminDb } from '@/firebase/admin';

export async function GET() {
  try {
    const adminDb = await getAdminDb();
    
    if (!adminDb) {
      return NextResponse.json({
        ok: false,
        message: 'Firebase Admin SDK not initialized. Check environment variables.',
        saEnv: !!process.env.FIREBASE_SERVICE_ACCOUNT,
        pidEnv: !!process.env.FIREBASE_PROJECT_ID,
        emailEnv: !!process.env.FIREBASE_CLIENT_EMAIL,
        keyLen: (process.env.FIREBASE_PRIVATE_KEY ?? '').length,
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
