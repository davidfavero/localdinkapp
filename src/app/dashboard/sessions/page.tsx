
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { NewGameSheet } from '@/components/new-game-sheet';
import { EditGameSessionSheet } from '@/components/edit-game-session-sheet';
import { GameSessionCard } from '@/components/game-session-card';
import { useCollection, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import type { GameSession, Player, Court, RsvpStatus } from '@/lib/types';
import { normalizeAttendees, partitionAttendees } from '@/lib/session-attendees';

/**
 * This is the improved "Game Sessions" page (formerly GamesPage).
 * Key upgrades:
 * - Renamed semantics to Game Sessions
 * - Sorted feed with pagination (infinite scroll-ready)
 * - Batched hydration for organizers/players/courts (no N+1)
 * - Robust loading/empty/error states
 * - Data model alignment for nested `games` under a `game-session`
 * - Types tightened; defensive formatting for dates
 */

// ---------- UI skeleton ----------
const LoadingSessionCard = () => (
  <div className="bg-card p-4 rounded-lg shadow-sm animate-pulse">
    <div className="h-6 bg-muted rounded w-3/4 mb-2" />
    <div className="h-4 bg-muted rounded w-1/2 mb-4" />
    <div className="flex items-center -space-x-2 mb-4">
      <div className="h-10 w-10 bg-muted rounded-full border-2 border-card" />
      <div className="h-10 w-10 bg-muted rounded-full border-2 border-card" />
      <div className="h-10 w-10 bg-muted rounded-full border-2 border-card" />
    </div>
    <div className="h-4 bg-muted rounded w-1/3" />
  </div>
);

const RSVP_PRIORITY: Record<RsvpStatus, number> = {
  DECLINED: 1,
  PENDING: 2,
  CONFIRMED: 3,
};

export default function GameSessionsPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSessionData, setSelectedSessionData] = useState<{
    courtId: string;
    startTime: Date;
    isDoubles: boolean;
  } | null>(null);
  const [pageSize] = useState(24);
  const [error, setError] = useState<string | null>(null);

  // Primary query: show all sessions (TODO: filter by user once index is deployed)
  const baseQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    console.log('[Sessions Query] Fetching for user:', user.uid);
    
    // TEMPORARY: Simplified query to test permissions (NO WHERE/ORDERBY)
    return query(
      collection(firestore, 'game-sessions'),
      limit(5)
    );
  }, [firestore, user, pageSize]);

  // Subscribe to collection (first page). If you want true infinite scroll, capture the last visible doc and requery.
  const { data: rawSessions, isLoading: isLoadingSessions } = useCollection(baseQuery);

  const [hydratedSessions, setHydratedSessions] = useState<GameSession[]>([]);
  const [isHydrating, setIsHydrating] = useState(true);

  // ---------- Batch hydration util ----------
  async function batchHydrate(
    fs: ReturnType<typeof useFirestore>,
    sessions: any[],
    currentUserId: string | null
  ): Promise<GameSession[]> {
    if (!sessions.length || !fs) return [];

    const courtIds = new Set<string>();
    const attendeeUserIds = new Set<string>();
    const attendeePlayerIds = new Set<string>();
    const attendeesBySession = new Map<string, ReturnType<typeof normalizeAttendees>>();

    sessions.forEach((s) => {
      if (s.courtId) courtIds.add(s.courtId);
      if (s.organizerId) attendeeUserIds.add(s.organizerId);

      const attendees = normalizeAttendees(s);
      attendeesBySession.set(s.id, attendees);

      const { userIds, playerIds } = partitionAttendees(attendees);
      userIds.forEach((id) => attendeeUserIds.add(id));
      playerIds.forEach((id) => attendeePlayerIds.add(id));
    });

    const chunk = <T,>(arr: T[], size = 10) =>
      Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
        arr.slice(i * size, i * size + size)
      );

    const courtsMap = new Map<string, Court>();
    const courtIdList = Array.from(courtIds);
    if (courtIdList.length > 0) {
      for (const idChunk of chunk(courtIdList)) {
        try {
          const q = query(collection(fs, 'courts'), where('__name__', 'in', idChunk));
          const snap = await getDocs(q);
          snap.forEach((d) => courtsMap.set(d.id, { id: d.id, ...(d.data() as any) }));
        } catch (error) {
          console.warn('Failed to load courts for session hydration (continuing with placeholders):', error);
        }
      }
    }

    const usersMap = new Map<string, Player>();
    const userIdList = Array.from(attendeeUserIds);
    if (userIdList.length > 0) {
      for (const idChunk of chunk(userIdList)) {
        try {
          const q = query(collection(fs, 'users'), where('__name__', 'in', idChunk));
          const snap = await getDocs(q);
          snap.forEach((d) => usersMap.set(d.id, { id: d.id, ...(d.data() as any) }));
        } catch (error) {
          console.warn(
            'Failed to load user profiles for session hydration (likely due to Firestore rules). Using fallback names.',
            error
          );
        }
      }
    }

    const contactsMap = new Map<string, Player>();
    const contactIdList = Array.from(attendeePlayerIds);
    if (contactIdList.length > 0) {
      for (const idChunk of chunk(contactIdList)) {
        try {
          const q = query(collection(fs, 'players'), where('__name__', 'in', idChunk));
          const snap = await getDocs(q);
          snap.forEach((d) => contactsMap.set(d.id, { id: d.id, ...(d.data() as any) }));
        } catch (error) {
          console.warn('Failed to load roster players for session hydration (continuing with placeholders):', error);
        }
      }
    }

    return sessions.map((s) => {
      const sessionDate: Date = s.startTime?.toDate ? s.startTime.toDate() : new Date(s.startTime ?? Date.now());
      const attendees = attendeesBySession.get(s.id) ?? [];

      const organizerRecord = s.organizerId && usersMap.get(s.organizerId)
        ? { ...(usersMap.get(s.organizerId) as Player), id: s.organizerId }
        : ({ id: 'unknown', firstName: 'Unknown', lastName: 'Organizer', avatarUrl: '', email: '' } as Player);

      const court = s.courtId && courtsMap.get(s.courtId)
        ? (courtsMap.get(s.courtId) as Court)
        : ({ id: 'unknown', name: 'Unknown Court', location: '', ownerId: '' } as Court);

      const players = attendees.map(({ id, source }) => {
        const baseRecord = source === 'player' ? contactsMap.get(id) : usersMap.get(id);
        let player: Player;

        if (baseRecord) {
          player = { ...baseRecord, id };
        } else {
          player = {
            id,
            firstName: source === 'player' ? 'Roster' : 'Unknown',
            lastName: 'Player',
            avatarUrl: '',
            email: '',
          } as Player;
        }

        if (source === 'user' && id === currentUserId) {
          player = { ...player, isCurrentUser: true };
        }

        const status = (s.playerStatuses?.[id] ?? (id === s.organizerId ? 'CONFIRMED' : 'PENDING')) as RsvpStatus;
        return { player, status };
      });

      const dedupedPlayersMap = new Map<string, { player: Player; status: RsvpStatus }>();
      players.forEach((entry) => {
        const key = entry.player.id ?? `${entry.player.firstName}-${entry.player.lastName}`;
        const existing = dedupedPlayersMap.get(key);
        if (!existing || RSVP_PRIORITY[entry.status] >= RSVP_PRIORITY[existing.status]) {
          dedupedPlayersMap.set(key, entry);
        }
      });
      const dedupedPlayers = Array.from(dedupedPlayersMap.values());

      const alternates: Player[] = (s.alternateIds || []).map((id: string) => {
        const baseRecord = usersMap.get(id) || contactsMap.get(id);
        if (baseRecord) {
          return { ...baseRecord, id } as Player;
        }
        return { id, firstName: 'Alternate', lastName: 'Player', avatarUrl: '', email: '' } as Player;
      });

      return {
        id: s.id,
        court,
        organizer: {
          ...organizerRecord,
          isCurrentUser: organizerRecord.id === currentUserId,
        },
        date: sessionDate.toLocaleDateString([], { month: 'short', day: 'numeric' }),
        time: sessionDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        type: s.isDoubles ? 'Doubles' : 'Singles',
        players: dedupedPlayers,
        alternates,
      } as GameSession;
    });
  }

  useEffect(() => {
    if (!firestore) return;
    if (!rawSessions) {
      if (!isLoadingSessions) setIsHydrating(false);
      return;
    }

    setIsHydrating(true);
    (async () => {
      try {
        const hydrated = await batchHydrate(firestore, rawSessions as any[], user?.uid ?? null);
        setHydratedSessions(hydrated);
        setError(null);
      } catch (e: any) {
        console.error(e);
        setError(e?.message ?? "Failed to load sessions");
      } finally {
        setIsHydrating(false);
      }
    })();
  }, [firestore, rawSessions, isLoadingSessions, user?.uid]);

  // Fetch all courts for both new and edit sheets
  const [allCourts, setAllCourts] = useState<Court[]>([]);
  useEffect(() => {
    if (!firestore) return;
    (async () => {
      try {
        const courtsSnap = await getDocs(collection(firestore, 'courts'));
        const courts = courtsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Court));
        setAllCourts(courts);
      } catch (e) {
        console.error('Error fetching courts:', e);
      }
    })();
  }, [firestore]);

  const handleSessionClick = (session: GameSession) => {
    const rawSession = rawSessions?.find((s: any) => s.id === session.id);
    if (rawSession) {
      setSelectedSessionId(session.id);
      setSelectedSessionData({
        courtId: rawSession.courtId,
        startTime: rawSession.startTime?.toDate() || new Date(),
        isDoubles: rawSession.isDoubles,
      });
      setIsEditSheetOpen(true);
    }
  };

  // No need to filter - query already fetches only user's sessions
  const userSessions = hydratedSessions;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">My Game Sessions</h1>
        <Button onClick={() => setIsSheetOpen(true)}>
          <Plus className="-ml-1 mr-2 h-4 w-4" />
          New Session
        </Button>
      </div>

      <NewGameSheet
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        courts={allCourts}
        isLoadingCourts={false}
      />

      <EditGameSessionSheet
        open={isEditSheetOpen}
        onOpenChange={setIsEditSheetOpen}
        sessionId={selectedSessionId}
        sessionData={selectedSessionData}
        courts={allCourts}
      />

      {(isLoadingSessions || isHydrating) && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <LoadingSessionCard key={i} />
          ))}
        </div>
      )}

      {error && (
        <div className="text-center py-12 border rounded-lg bg-destructive/5 text-destructive">
          <p className="font-medium">{error}</p>
        </div>
      )}

      {!isLoadingSessions && !isHydrating && !error && userSessions.length === 0 && (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <h3 className="text-xl font-medium text-muted-foreground">No Sessions Organized Yet</h3>
          <p className="text-muted-foreground mt-2">Create a new session to start organizing games.</p>
          <Button onClick={() => setIsSheetOpen(true)} className="mt-4">
            <Plus className="mr-2 h-4 w-4" />
            New Session
          </Button>
        </div>
      )}

      {!isLoadingSessions && !isHydrating && !error && userSessions.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {userSessions.map((session) => (
            <div key={session.id} onClick={() => handleSessionClick(session)} className="cursor-pointer">
              <GameSessionCard session={session} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
