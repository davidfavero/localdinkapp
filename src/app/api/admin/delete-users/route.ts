import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminAuth } from '@/firebase/admin';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = ['davidfavero@gmail.com', 'david@localdink.com', 'mdfavero@gmail.com'];

function isAdmin(email?: string): boolean {
  if (!email) return false;
  const fromEnv = (process.env.NEXT_PUBLIC_ADMIN_DEBUG_EMAILS || '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  const allowlist = fromEnv.length > 0 ? fromEnv : ADMIN_EMAILS;
  return allowlist.includes(email.toLowerCase());
}

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const cookieStore = await cookies();
    const idToken = cookieStore.get('auth-token')?.value;
    if (!idToken) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const auth = await getAdminAuth();
    const decoded = await auth.verifyIdToken(idToken);

    let adminEmail = decoded.email;
    if (!adminEmail) {
      const db = await getAdminDb();
      if (db) {
        const userDoc = await db.collection('users').doc(decoded.uid).get();
        if (userDoc.exists) {
          adminEmail = userDoc.data()?.email;
        }
      }
    }

    if (!isAdmin(adminEmail)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const userIds: string[] = body.userIds;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'userIds array is required' }, { status: 400 });
    }

    // Safety: prevent deleting your own account
    if (userIds.includes(decoded.uid)) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
    }

    const db = await getAdminDb();
    if (!db) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }

    const results: { uid: string; deleted: boolean; error?: string; cleanedCollections: string[] }[] = [];

    for (const uid of userIds) {
      try {
        const cleanedCollections: string[] = [];

        // 1. Delete user doc from 'users' collection
        const userDocRef = db.collection('users').doc(uid);
        const userDoc = await userDocRef.get();
        if (userDoc.exists) {
          await userDocRef.delete();
          cleanedCollections.push('users');
        }

        // 2. Clean up owned data in other collections
        // Define which fields to query per collection
        const fieldsByCollection: Record<string, string[]> = {
          players: ['ownerId'],
          groups: ['ownerId'],
          courts: ['ownerId'],
          'game-sessions': ['organizerId'],
          conversations: [],  // conversations use participantIds array, skip for now
          notifications: ['userId'],
        };

        for (const [collName, fields] of Object.entries(fieldsByCollection)) {
          for (const field of fields) {
            try {
              const snap = await db.collection(collName)
                .where(field, '==', uid)
                .get();
              for (const doc of snap.docs) {
                await doc.ref.delete();
              }
              if (snap.size > 0) {
                cleanedCollections.push(`${collName}(${snap.size})`);
              }
            } catch (queryErr: any) {
              // Log but don't fail the whole user deletion for a cleanup query error
              console.warn(`Cleanup query failed for ${collName}.${field}:`, queryErr.message);
            }
          }
        }

        // 3. Delete Firebase Auth account
        try {
          await auth.deleteUser(uid);
        } catch (authErr: any) {
          // user-not-found is fine (orphan Firestore doc with no auth account)
          if (authErr.code !== 'auth/user-not-found') {
            throw authErr;
          }
        }

        results.push({ uid, deleted: true, cleanedCollections });
      } catch (err: any) {
        results.push({ uid, deleted: false, error: err.message, cleanedCollections: [] });
      }
    }

    return NextResponse.json({ results });
  } catch (err: any) {
    console.error('Admin delete-users error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
