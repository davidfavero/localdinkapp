export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAdminDb, getAdminAuth } from '@/firebase/admin';
import { cookies } from 'next/headers';

export async function GET() {
  try {
    // Require authentication — this is a debug endpoint
    const cookieStore = await cookies();
    const idToken = cookieStore.get('auth-token')?.value;
    if (!idToken) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    try {
      const auth = await getAdminAuth();
      await auth.verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: 'Invalid or expired auth token' }, { status: 401 });
    }

    const adminDb = await getAdminDb();
    
    if (!adminDb) {
      return NextResponse.json({
        ok: false,
        message: 'Firebase Admin SDK not initialized. Check server logs for details.',
      }, { status: 503 });
    }

    const snap = await adminDb.collection('_ping').limit(1).get();
    return NextResponse.json({
      ok: true,
      docs: snap.size,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: 'Internal error' }, { status: 500 });
  }
}
