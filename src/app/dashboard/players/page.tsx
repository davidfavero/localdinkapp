'use client';

import { Card, CardContent } from '@/components/ui/card';
import { UserAvatar } from '@/components/user-avatar';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useCollection, useUser } from '@/firebase';
import { collection, query } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import type { Player } from '@/lib/types';
import { useMemoFirebase } from '@/firebase/provider';

export default function PlayersPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const playersQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'users'));
  }, [firestore]);

  const { data: players, isLoading } = useCollection<Player>(playersQuery);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">Your Players</h2>
        <Button>
          <Plus className="-ml-1 mr-2 h-4 w-4" />
          Add Player
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {isLoading &&
          Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="p-4">
              <CardContent className="flex items-center gap-4 p-0">
                <div className="h-12 w-12 rounded-full bg-muted animate-pulse" />
                <div className="space-y-2">
                  <div className="h-4 w-24 rounded-md bg-muted animate-pulse" />
                  <div className="h-3 w-16 rounded-md bg-muted animate-pulse" />
                </div>
              </CardContent>
            </Card>
          ))}
        {players?.map((player) => (
          <Card key={player.id} className="p-4">
            <CardContent className="flex items-center gap-4 p-0">
              <UserAvatar player={player} className="h-12 w-12" />
              <div>
                <p className="font-semibold">{player.name}</p>
                {player.id === user?.uid && (
                  <p className="text-sm text-muted-foreground">This is you</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
