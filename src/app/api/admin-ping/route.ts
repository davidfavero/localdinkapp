export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { adminDb } from '@/firebase/admin';

export async function GET() {
  try {
    // quick read to prove auth works
    const snap = await adminDb.collection('_ping').limit(1).get();
    return NextResponse.json({
      ok: true,
      projectId: process.env.FIREBASE_PROJECT_ID ?? null,
      sa: !!process.env.FIREBASE_SERVICE_ACCOUNT,
      pid: !!process.env.FIREBASE_PROJECT_ID,
      email: !!process.env.FIREBASE_CLIENT_EMAIL,
      keylen: (process.env.FIREBASE_PRIVATE_KEY ?? '').length,
      docs: snap.size,
    });
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      message: e?.message ?? String(e),
    }, { status: 500 });
  }
}
