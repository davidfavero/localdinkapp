'use client';

import { useState } from 'react';
import { GameSessionCard } from '@/components/game-session-card';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useCollection, useFirestore } from '@/firebase';
import { collection, query, getDoc, doc } from 'firebase/firestore';
import type { GameSession, Player, Court } from '@/lib/types';
import { useMemoFirebase } from '@/firebase/provider';
import { useEffect } from 'react';
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
  
  const { data: rawSessions, isLoading } = useCollection(sessionsQuery);
  
  const [hydratedSessions, setHydratedSessions] = useState<GameSession[]>([]);

  useEffect(() => {
    if (!rawSessions || !firestore) return;

    const hydrate = async () => {
        const hydrated = await Promise.all(rawSessions.map(async (session: any) => {
            
            // This is a simplified hydration. In a real app, you might want to batch these reads.
            const courtSnap = await getDoc(doc(firestore, 'courts', session.courtId));
            const court = { id: courtSnap.id, ...courtSnap.data() } as Court;

            const organizerSnap = await getDoc(doc(firestore, 'users', session.organizerId));
            const organizer = { id: organizerSnap.id, ...organizerSnap.data() } as Player;
            
            // For now, we'll represent players and alternates by their IDs.
            // A more complex implementation would fetch their full profiles.
            const players = session.playerIds?.map((id: string) => ({ player: { id, name: 'Player', avatarUrl: '' }, status: 'CONFIRMED' })) || [];
            const alternates = session.alternateIds?.map((id: string) => ({ id, name: 'Alternate', avatarUrl: '' })) || [];

            const sessionDate = session.startTime?.toDate ? session.startTime.toDate() : new Date();

            return {
                id: session.id,
                court,
                organizer,
                date: sessionDate.toLocaleDateString([], { weekday: 'long' }),
                time: sessionDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
                type: session.isDoubles ? 'Doubles' : 'Singles',
                players: players,
                alternates: alternates,
            } as GameSession
        }));
        setHydratedSessions(hydrated);
    }

    hydrate();

  }, [rawSessions, firestore])


  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">Upcoming Games</h2>
        <NewGameSheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <Button onClick={() => setIsSheetOpen(true)}>
              <Plus className="-ml-1 mr-2 h-4 w-4" />
              New Game
            </Button>
        </NewGameSheet>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading && Array.from({length: 3}).map((_, i) => <LoadingGameCard key={i} />)}
        {hydratedSessions.map((session) => (
          <GameSessionCard key={session.id} session={session} />
        ))}
      </div>
    </div>
  );
}