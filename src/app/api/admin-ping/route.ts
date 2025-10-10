export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { adminDb } from '@/firebase/admin';

export async function GET() {
  try {
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
