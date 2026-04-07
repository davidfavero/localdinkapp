import { NextResponse } from 'next/server';
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

async function countCollection(db: FirebaseFirestore.Firestore, collectionName: string): Promise<number> {
  const snap = await db.collection(collectionName).count().get();
  return snap.data().count;
}

export async function GET() {
  try {
    // Auth check
    const cookieStore = await cookies();
    const idToken = cookieStore.get('auth-token')?.value;
    if (!idToken) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const auth = await getAdminAuth();
    const decoded = await auth.verifyIdToken(idToken);
    
    // Check admin by auth token email first
    let adminEmail = decoded.email;
    
    // For phone auth users, look up their profile email in Firestore
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

    const db = await getAdminDb();
    if (!db) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }

    // Aggregate counts
    const [
      totalUsers,
      totalPlayers,
      totalSessions,
      totalConversations,
      totalCourts,
      totalGroups,
      totalNotifications,
    ] = await Promise.all([
      countCollection(db, 'users'),
      countCollection(db, 'players'),
      countCollection(db, 'game-sessions'),
      countCollection(db, 'conversations'),
      countCollection(db, 'courts'),
      countCollection(db, 'groups'),
      countCollection(db, 'notifications'),
    ]);

    // Recent users (last 20, ordered by creation — if no createdAt, we list them all)
    const usersSnap = await db.collection('users')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();
    
    // Fallback: if createdAt doesn't exist on docs, just get all users
    let recentUsers: any[] = [];
    if (usersSnap.empty) {
      const allUsersSnap = await db.collection('users').limit(50).get();
      recentUsers = allUsersSnap.docs.map(d => ({
        id: d.id,
        ...d.data(),
      }));
    } else {
      recentUsers = usersSnap.docs.map(d => ({
        id: d.id,
        ...d.data(),
      }));
    }

    // Recent sessions (last 20)
    const sessionsSnap = await db.collection('game-sessions')
      .orderBy('startTime', 'desc')
      .limit(20)
      .get();
    const recentSessions = sessionsSnap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        courtName: data.courtName || 'Unknown',
        courtLocation: data.courtLocation || '',
        organizerId: data.organizerId,
        startTime: data.startTime?.toDate?.()?.toISOString() || null,
        playerCount: data.playerIds?.length || 0,
        isDoubles: data.isDoubles || false,
        status: data.status || 'open',
      };
    });

    // Sessions per day (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentSessionsSnap = await db.collection('game-sessions')
      .where('startTime', '>=', thirtyDaysAgo)
      .get();
    
    const sessionsByDay: Record<string, number> = {};
    recentSessionsSnap.docs.forEach(d => {
      const data = d.data();
      const date = data.startTime?.toDate?.();
      if (date) {
        const key = date.toISOString().split('T')[0];
        sessionsByDay[key] = (sessionsByDay[key] || 0) + 1;
      }
    });

    // User list with details
    const allUsersSnap = await db.collection('users').get();
    const userList = allUsersSnap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        email: data.email || '',
        phone: data.phone || '',
        avatarUrl: data.avatarUrl || '',
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
      };
    });

    // Map organizer names
    const userMap = new Map(userList.map(u => [u.id, u]));
    const sessionsWithOrganizer = recentSessions.map(s => ({
      ...s,
      organizerName: userMap.has(s.organizerId)
        ? `${userMap.get(s.organizerId)!.firstName} ${userMap.get(s.organizerId)!.lastName}`.trim() || 'Unknown'
        : 'Unknown',
    }));

    return NextResponse.json({
      counts: {
        users: totalUsers,
        players: totalPlayers,
        sessions: totalSessions,
        conversations: totalConversations,
        courts: totalCourts,
        groups: totalGroups,
        notifications: totalNotifications,
      },
      recentSessions: sessionsWithOrganizer,
      sessionsByDay,
      users: userList,
    });
  } catch (error: any) {
    console.error('Admin analytics error:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
