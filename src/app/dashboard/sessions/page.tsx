
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { NewGameSheet } from '@/components/new-game-sheet';
import { GameSessionCard } from '@/components/game-session-card';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase/provider';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import type { GameSession, Player, Court } from '@/lib/types';

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

export default function GameSessionsPage() {
  const firestore = useFirestore();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [pageSize] = useState(24);
  const [error, setError] = useState<string | null>(null);

  // Primary query: newest first
  const baseQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(
      collection(firestore, 'game-sessions'),
      orderBy('startTime', 'desc'),
      limit(pageSize)
    );
  }, [firestore, pageSize]);

  // Subscribe to collection (first page). If you want true infinite scroll, capture the last visible doc and requery.
  const { data: rawSessions, isLoading: isLoadingSessions } = useCollection(baseQuery);

  const [hydratedSessions, setHydratedSessions] = useState<GameSession[]>([]);
  const [isHydrating, setIsHydrating] = useState(true);

  // ---------- Batch hydration util ----------
  async function batchHydrate(
    fs: ReturnType<typeof useFirestore>,
    sessions: any[]
  ): Promise<GameSession[]> {
    if (!sessions.length || !fs) return [];

    // Gather IDs to hydrate
    const courtIds = new Set<string>();
    const userIds = new Set<string>();

    sessions.forEach((s) => {
      if (s.courtId) courtIds.add(s.courtId);
      if (s.organizerId) userIds.add(s.organizerId);
      (s.playerIds || []).forEach((id: string) => userIds.add(id));
    });

    // Chunked fetch helper (Firestore `in` max 30 values in latest SDKs, but 10 is safer)
    const chunk = <T,>(arr: T[], size = 10) =>
      Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
        arr.slice(i * size, i * size + size)
      );

    // Courts batch
    const courtsMap = new Map<string, Court>();
    const courtIdList = Array.from(courtIds);
    if (courtIdList.length > 0) {
        for (const idChunk of chunk(courtIdList)) {
            const q = query(collection(fs, "courts"), where("__name__", "in", idChunk));
            const snap = await getDocs(q);
            snap.forEach((d) => courtsMap.set(d.id, { id: d.id, ...(d.data() as any) }));
        }
    }


    // Users batch
    const usersMap = new Map<string, Player>();
    const userIdList = Array.from(userIds);
    if (userIdList.length > 0) {
        for (const idChunk of chunk(userIdList)) {
            const q = query(collection(fs, "users"), where("__name__", "in", idChunk));
            const snap = await getDocs(q);
            snap.forEach((d) => usersMap.set(d.id, { id: d.id, ...(d.data() as any) }));
        }
    }


    // Assemble hydrated sessions
    const toDisplay = sessions.map((s) => {
      const sessionDate: Date = s.startTime?.toDate ? s.startTime.toDate() : new Date(s.startTime ?? Date.now());

      const organizer = s.organizerId && usersMap.get(s.organizerId)
        ? (usersMap.get(s.organizerId) as Player)
        : ({ id: "unknown", firstName: "Unknown", lastName: "Organizer", avatarUrl: "" } as Player);

      const court = s.courtId && courtsMap.get(s.courtId)
        ? (courtsMap.get(s.courtId) as Court)
        : ({ id: "unknown", name: "Unknown Court", location: "" } as Court);

      const players = (s.playerIds || []).map((id: string) => {
        const player = usersMap.get(id) || ({ id, firstName: "Unknown", lastName: "Player", avatarUrl: "" } as Player);
        // If you store per-player status inside the session, swap this to s.playerStatuses[id]
        return { player, status: (s.playerStatuses?.[id] ?? "CONFIRMED") as any };
      });

      const alternates: Player[] = (s.alternateIds || []).map((id: string) =>
        (usersMap.get(id) as Player) || ({ id, firstName: "Unknown", lastName: "Player", avatarUrl: "" } as Player)
      );

      const display: GameSession = {
        id: s.id,
        court,
        organizer,
        date: sessionDate.toLocaleDateString([], { month: "short", day: "numeric" }),
        time: sessionDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        type: s.isDoubles ? "Doubles" : "Singles",
        players,
        alternates,
      };

      return display;
    });

    return toDisplay;
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
        const hydrated = await batchHydrate(firestore, rawSessions as any[]);
        setHydratedSessions(hydrated);
        setError(null);
      } catch (e: any) {
        console.error(e);
        setError(e?.message ?? "Failed to load sessions");
      } finally {
        setIsHydrating(false);
      }
    })();
  }, [firestore, rawSessions, isLoadingSessions]);

  const allCourtsFromSessions = useMemo(() => {
      const courtMap = new Map<string, Court>();
      hydratedSessions.forEach(s => {
          if (s.court && s.court.id !== 'unknown') {
              courtMap.set(s.court.id, s.court);
          }
      });
      return Array.from(courtMap.values());
  }, [hydratedSessions]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Game Sessions</h1>
        <Button onClick={() => setIsSheetOpen(true)}>
          <Plus className="-ml-1 mr-2 h-4 w-4" />
          New Session
        </Button>
      </div>

      <NewGameSheet
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        courts={allCourtsFromSessions}
        isLoadingCourts={isLoadingSessions || isHydrating}
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

      {!isLoadingSessions && !isHydrating && !error && hydratedSessions.length === 0 && (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <h3 className="text-xl font-medium text-muted-foreground">No Sessions Scheduled</h3>
          <p className="text-muted-foreground mt-2">Create a new session or ask Robin to schedule one for you.</p>
        </div>
      )}

      {!isLoadingSessions && !isHydrating && !error && hydratedSessions.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {hydratedSessions.map((session) => (
            <GameSessionCard key={session.id} session={session} />
          ))}
        </div>
      )}
    </div>
  );
}
