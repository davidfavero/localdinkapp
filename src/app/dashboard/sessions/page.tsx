
'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NewGameSheet } from '@/components/new-game-sheet';
import { EditGameSessionSheet } from '@/components/edit-game-session-sheet';
import { GameSessionCard } from '@/components/game-session-card';
import { useCollection, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import { collection, getDocs, limit, orderBy, query, where, doc, updateDoc, setDoc } from 'firebase/firestore';
import type { GameSession, Player, Court, RsvpStatus } from '@/lib/types';
import { normalizeAttendees, partitionAttendees } from '@/lib/session-attendees';
import { useToast } from '@/hooks/use-toast';
import { updateRsvpStatusAction } from '@/lib/actions';

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
  const { user, profile } = useUser();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSessionData, setSelectedSessionData] = useState<{
    courtId: string;
    startTime: Date;
    isDoubles: boolean;
    playerIds?: string[];
    attendees?: { id: string; source: 'user' | 'player' }[];
    playerStatuses?: Record<string, RsvpStatus>;
    maxPlayers?: number;
  } | null>(null);
  const [pageSize] = useState(24);
  const [error, setError] = useState<string | null>(null);

  // Filter sessions by organizer (user's own sessions)
  const baseQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    console.log('[Sessions Query] Fetching organized sessions for user:', user.uid);
    
    // Show sessions where user is the organizer, ordered by start time (newest first)
    return query(
      collection(firestore, 'game-sessions'),
      where('organizerId', '==', user.uid),
      orderBy('startTime', 'desc'),
      limit(pageSize)
    );
  }, [firestore, user, pageSize]);

  // Query for sessions where user is invited (in playerIds but not organizer)
  const invitesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    console.log('[Sessions Query] Fetching invites for user:', user.uid);
    
    // Show sessions where user is in playerIds array, ordered by start time (newest first)
    return query(
      collection(firestore, 'game-sessions'),
      where('playerIds', 'array-contains', user.uid),
      orderBy('startTime', 'desc'),
      limit(pageSize)
    );
  }, [firestore, user, pageSize]);

  // Subscribe to collection (first page). If you want true infinite scroll, capture the last visible doc and requery.
  const { data: rawSessions, isLoading: isLoadingSessions } = useCollection(baseQuery);
  const { data: rawInvites, isLoading: isLoadingInvites } = useCollection(invitesQuery);

  const [hydratedSessions, setHydratedSessions] = useState<GameSession[]>([]);
  const [hydratedInvites, setHydratedInvites] = useState<GameSession[]>([]);
  const [confirmedInvites, setConfirmedInvites] = useState<GameSession[]>([]);
  const [pendingInvites, setPendingInvites] = useState<GameSession[]>([]);
  const [isHydrating, setIsHydrating] = useState(true);
  const [isHydratingInvites, setIsHydratingInvites] = useState(true);

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
          // If this is a player contact linked to a registered user, prefer the user's
          // live profile for name and avatar so updates propagate immediately.
          const linkedUser = source === 'player' && baseRecord.linkedUserId
            ? usersMap.get(baseRecord.linkedUserId)
            : null;
          if (linkedUser) {
            player = {
              ...baseRecord,
              id,
              firstName: linkedUser.firstName || baseRecord.firstName,
              lastName: linkedUser.lastName || baseRecord.lastName,
              avatarUrl: linkedUser.avatarUrl || baseRecord.avatarUrl,
            };
          } else {
            // Preserve all fields from the base record, including linkedUserId
            player = { ...baseRecord, id };
          }
        } else {
          player = {
            id,
            firstName: source === 'player' ? 'Roster' : 'Unknown',
            lastName: 'Player',
            avatarUrl: '',
            email: '',
          } as Player;
        }

        // Mark as current user if this is the logged-in user
        if (id === currentUserId) {
          player = { ...player, isCurrentUser: true };
        }
        
        // For player contacts, check if they're linked to the current user
        if (source === 'player' && baseRecord?.linkedUserId === currentUserId) {
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
        date: sessionDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
        time: sessionDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        startDate: sessionDate,
        type: s.isDoubles ? 'Doubles' : 'Singles',
        players: dedupedPlayers,
        alternates,
        recurring: s.recurring,
      } as GameSession;
    });
  }

  useEffect(() => {
    if (!firestore) return;
    
    // Wait for both queries to finish loading before hydrating
    if (isLoadingSessions || isLoadingInvites) return;
    
    const allRaw = [
      ...(rawSessions || []),
      ...((rawInvites || []) as any[]).filter((s: any) => s.organizerId !== user?.uid),
    ];
    
    if (allRaw.length === 0) {
      setIsHydrating(false);
      setIsHydratingInvites(false);
      return;
    }

    setIsHydrating(true);
    setIsHydratingInvites(true);
    (async () => {
      try {
        // Single hydration pass for all sessions (organized + invites)
        const hydratedAll = await batchHydrate(firestore, allRaw as any[], user?.uid ?? null);
        
        // Split back into organized vs invites
        const organizedIds = new Set((rawSessions || []).map((s: any) => s.id));
        const organized = hydratedAll.filter(s => organizedIds.has(s.id));
        const invites = hydratedAll.filter(s => !organizedIds.has(s.id));
        
        setHydratedSessions(organized);
        
        // Split invites by status
        const confirmed = invites.filter(s => {
          const raw = (rawInvites as any[])?.find((r: any) => r.id === s.id);
          return raw?.playerStatuses?.[user?.uid!] === 'CONFIRMED';
        });
        const pending = invites.filter(s => {
          const raw = (rawInvites as any[])?.find((r: any) => r.id === s.id);
          return raw?.playerStatuses?.[user?.uid!] === 'PENDING';
        });
        
        setConfirmedInvites(confirmed);
        setPendingInvites(pending);
        setHydratedInvites(invites);
        setError(null);
      } catch (e: any) {
        console.error(e);
        setError(e?.message ?? "Failed to load sessions");
      } finally {
        setIsHydrating(false);
        setIsHydratingInvites(false);
      }
    })();
  }, [firestore, rawSessions, rawInvites, isLoadingSessions, isLoadingInvites, user?.uid]);

  // Fetch all courts for both new and edit sheets
  // Note: Courts have public read access, but we still wait for user auth
  // to ensure the page doesn't make any queries before auth is resolved
  const [allCourts, setAllCourts] = useState<Court[]>([]);
  const [availableEditPlayers, setAvailableEditPlayers] = useState<Player[]>([]);
  useEffect(() => {
    if (!firestore || !user) return;
    (async () => {
      try {
        const courtsSnap = await getDocs(
          query(collection(firestore, 'courts'), where('ownerId', '==', user.uid))
        );
        const courts = courtsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Court));
        setAllCourts(courts);
      } catch (e) {
        console.error('Error fetching courts:', e);
      }
    })();
  }, [firestore, user]);

  useEffect(() => {
    if (!firestore || !user?.uid) return;
    (async () => {
      try {
        const contactsSnap = await getDocs(
          query(collection(firestore, 'players'), where('ownerId', '==', user.uid))
        );
        const contacts = contactsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Player));
        const merged = new Map<string, Player>();
        contacts.forEach((p) => merged.set(p.id, p));
        if (profile?.id) {
          merged.set(profile.id, { ...profile, isCurrentUser: true });
        }
        setAvailableEditPlayers(Array.from(merged.values()));
      } catch (error) {
        console.error('Error fetching available edit players:', error);
      }
    })();
  }, [firestore, user?.uid, profile]);

  const handleSessionClick = (session: GameSession) => {
    // Look for session in both organized sessions and invites
    const rawSession = rawSessions?.find((s: any) => s.id === session.id) 
      || rawInvites?.find((s: any) => s.id === session.id);
    if (rawSession) {
      setSelectedSessionId(session.id);
      setSelectedSessionData({
        courtId: rawSession.courtId,
        startTime: rawSession.startTime?.toDate() || new Date(),
        isDoubles: rawSession.isDoubles,
        playerIds: rawSession.playerIds || [],
        attendees: rawSession.attendees || [],
        playerStatuses: rawSession.playerStatuses || {},
        maxPlayers: rawSession.maxPlayers,
      });
      setIsEditSheetOpen(true);
    }
  };

  // Build a map of session ID → current user's invite status (from raw data)
  const inviteStatusMap = useMemo(() => {
    const map = new Map<string, RsvpStatus>();
    if (!rawInvites || !user) return map;
    (rawInvites as any[]).forEach((raw: any) => {
      if (raw.organizerId !== user.uid) {
        const status = raw.playerStatuses?.[user.uid] as RsvpStatus | undefined;
        if (status) map.set(raw.id, status);
        else map.set(raw.id, 'PENDING');
      }
    });
    return map;
  }, [rawInvites, user]);

  const { toast } = useToast();

  const handleAcceptInvite = useCallback(async (sessionId: string) => {
    if (!user) return;
    try {
      const result = await updateRsvpStatusAction(sessionId, user.uid, 'CONFIRMED');
      if (!result.success) throw new Error(result.message);
      toast({ title: 'RSVP Confirmed!', description: 'You have accepted the game invite.' });
    } catch (error) {
      console.error('Error accepting invite:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not accept the invite.' });
    }
  }, [user, toast]);

  const handleDeclineInvite = useCallback(async (sessionId: string) => {
    if (!user) return;
    try {
      const result = await updateRsvpStatusAction(sessionId, user.uid, 'DECLINED');
      if (!result.success) throw new Error(result.message);
      toast({ title: 'Invite Declined', description: 'You have declined the game invite.' });
    } catch (error) {
      console.error('Error declining invite:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not decline the invite.' });
    }
  }, [user, toast]);

  // Combine organized sessions with ALL invites for "My Games"
  const myGames = useMemo(() => {
    const combined = [...hydratedSessions, ...hydratedInvites];
    // Sort by date (most recent first)
    return combined.sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
  }, [hydratedSessions, hydratedInvites]);

  // Split into upcoming and past sessions
  const now = new Date();
  const upcomingSessions = useMemo(() => {
    return myGames
      .filter(s => s.startDate >= now)
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime()); // soonest first
  }, [myGames]);

  const pastSessions = useMemo(() => {
    return myGames.filter(s => s.startDate < now);
    // Already sorted newest-first from myGames
  }, [myGames]);

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
        availablePlayers={availableEditPlayers}
        currentUserId={user?.uid || null}
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

      {!isLoadingSessions && !isHydrating && !error && myGames.length === 0 && (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <h3 className="text-xl font-medium text-muted-foreground">No Sessions Organized Yet</h3>
          <p className="text-muted-foreground mt-2">Create a new session to start organizing games.</p>
          <Button onClick={() => setIsSheetOpen(true)} className="mt-4">
            <Plus className="mr-2 h-4 w-4" />
            New Session
          </Button>
        </div>
      )}

      {!isLoadingSessions && !isHydrating && !error && myGames.length > 0 && (
        <Tabs defaultValue="upcoming">
          <TabsList className="grid w-full grid-cols-2 max-w-xs">
            <TabsTrigger value="upcoming">
              Upcoming{upcomingSessions.length > 0 ? ` (${upcomingSessions.length})` : ''}
            </TabsTrigger>
            <TabsTrigger value="past">
              Past{pastSessions.length > 0 ? ` (${pastSessions.length})` : ''}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="mt-4">
            {upcomingSessions.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {upcomingSessions.map((session) => {
                  const status = inviteStatusMap.get(session.id);
                  return (
                    <div key={session.id} onClick={status !== 'PENDING' ? () => handleSessionClick(session) : undefined} className={status !== 'PENDING' ? 'cursor-pointer' : ''}>
                      <GameSessionCard
                        session={session}
                        currentUserStatus={status}
                        onAccept={status === 'PENDING' ? () => handleAcceptInvite(session.id) : undefined}
                        onDecline={status === 'PENDING' ? () => handleDeclineInvite(session.id) : undefined}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 border-2 border-dashed rounded-lg">
                <p className="text-muted-foreground">No upcoming sessions. Schedule one with Robin or tap New Session!</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="past" className="mt-4">
            {pastSessions.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {pastSessions.map((session) => {
                  const status = inviteStatusMap.get(session.id);
                  return (
                    <div key={session.id} onClick={() => handleSessionClick(session)} className="cursor-pointer">
                      <GameSessionCard session={session} currentUserStatus={status} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 border-2 border-dashed rounded-lg">
                <p className="text-muted-foreground">No past sessions yet.</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
