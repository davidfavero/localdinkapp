'use client';

import { useState, useEffect } from 'react';
import { GameSessionCard } from '@/components/game-session-card';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useCollection, useFirestore } from '@/firebase';
import { collection, query, getDoc, doc } from 'firebase/firestore';
import type { GameSession, Player, Court } from '@/lib/types';
import { useMemoFirebase } from '@/firebase/provider';
import { NewGameSheet } from '@/components/new-game-sheet';

// A placeholder for when data is loading to avoid showing an empty state.
const LoadingGameCard = () => (
    <div className="bg-card p-4 rounded-lg shadow-sm animate-pulse">
        <div className="h-6 bg-muted rounded w-3/4 mb-2"></div>
        <div className="h-4 bg-muted rounded w-1/2 mb-4"></div>
        <div className="flex items-center -space-x-2 mb-4">
            <div className="h-10 w-10 bg-muted rounded-full border-2 border-card"></div>
            <div className="h-10 w-10 bg-muted rounded-full border-2 border-card"></div>
            <div className="h-10 w-10 bg-muted rounded-full border-2 border-card"></div>
        </div>
        <div className="h-4 bg-muted rounded w-1/3"></div>
    </div>
);

export default function GamesPage() {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const firestore = useFirestore();

  const sessionsQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'game-sessions')) : null),
    [firestore]
  );
  
  const { data: rawSessions, isLoading: isLoadingSessions } = useCollection(sessionsQuery);
  const [hydratedSessions, setHydratedSessions] = useState<GameSession[]>([]);
  const [isHydrating, setIsHydrating] = useState(true);

  const courtsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'courts') : null),
    [firestore]
  );
  const { data: courts, isLoading: isLoadingCourts } = useCollection<Court>(courtsQuery);


  useEffect(() => {
    if (!rawSessions || !firestore) {
      if (!isLoadingSessions) setIsHydrating(false);
      return;
    };
    
    setIsHydrating(true);

    const hydrate = async () => {
        const hydrated = await Promise.all(rawSessions.map(async (session: any) => {
            
            // This is a simplified hydration. In a real app, you might want to batch these reads.
            const courtSnap = session.courtId ? await getDoc(doc(firestore, 'courts', session.courtId)) : null;
            const court = courtSnap?.exists() ? { id: courtSnap.id, ...courtSnap.data() } as Court : { id: 'unknown', name: 'Unknown Court', location: '' };

            const organizerSnap = session.organizerId ? await getDoc(doc(firestore, 'users', session.organizerId)) : null;
            const organizer = organizerSnap?.exists() ? { id: organizerSnap.id, ...organizerSnap.data() } as Player : { id: 'unknown', name: 'Unknown Organizer', avatarUrl: '' };
            
            const playerPromises = (session.playerIds || []).map(async (id: string) => {
                const playerSnap = await getDoc(doc(firestore, 'users', id));
                const playerData = playerSnap.exists() ? { id: playerSnap.id, ...playerSnap.data() } as Player : { id, name: 'Unknown Player', avatarUrl: '' };
                // Placeholder status, a real app would store this in the session
                return { player: playerData, status: 'CONFIRMED' as const };
            });
            const players = await Promise.all(playerPromises);
            
            // For now, alternates are empty.
            const alternates: Player[] = [];

            const sessionDate = session.startTime?.toDate ? session.startTime.toDate() : new Date();

            return {
                id: session.id,
                court,
                organizer,
                date: sessionDate.toLocaleDateString([], { month: 'short', day: 'numeric' }),
                time: sessionDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
                type: session.isDoubles ? 'Doubles' : 'Singles',
                players: players,
                alternates: alternates,
            } as GameSession
        }));
        setHydratedSessions(hydrated);
        setIsHydrating(false);
    }

    hydrate();

  }, [rawSessions, firestore, isLoadingSessions])


  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">Upcoming Games</h2>
        <Button onClick={() => setIsSheetOpen(true)}>
          <Plus className="-ml-1 mr-2 h-4 w-4" />
          New Game
        </Button>
      </div>

      <NewGameSheet 
        open={isSheetOpen} 
        onOpenChange={setIsSheetOpen}
        courts={courts || []}
        isLoadingCourts={isLoadingCourts}
      />

      {(isLoadingSessions || isHydrating) && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({length: 3}).map((_, i) => <LoadingGameCard key={i} />)}
        </div>
      )}

      {!isLoadingSessions && !isHydrating && hydratedSessions.length === 0 && (
          <div className="text-center py-12 border-2 border-dashed rounded-lg">
            <h3 className="text-xl font-medium text-muted-foreground">No Games Scheduled</h3>
            <p className="text-muted-foreground mt-2">Create a new game or ask Robin to schedule one for you.</p>
          </div>
      )}

      {!isLoadingSessions && !isHydrating && hydratedSessions.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {hydratedSessions.map((session) => (
              <GameSessionCard key={session.id} session={session} />
            ))}
        </div>
      )}
    </div>
  );
}
