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
import { useState } from 'react';
import { AddPlayerSheet } from '@/components/add-player-sheet';

export default function PlayersPage() {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const firestore = useFirestore();
  const { user } = useUser();
  const playersQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'users'));
  }, [firestore]);

  const { data: players, isLoading } = useCollection<Player>(playersQuery);
  
  const getPlayerName = (player: Player) => {
    if (player.firstName && player.lastName) {
      return `${player.firstName} ${player.lastName}`;
    }
    return player.name || 'Unnamed Player';
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end items-center">
        <Button onClick={() => setIsSheetOpen(true)}>
          <Plus className="-ml-1 mr-2 h-4 w-4" />
          Add Player
        </Button>
      </div>

      <AddPlayerSheet open={isSheetOpen} onOpenChange={setIsSheetOpen} />

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
                <p className="font-semibold">{getPlayerName(player)}</p>
                {player.id === user?.uid && (
                  <p className="text-sm text-muted-foreground">This is you</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
         {!isLoading && players?.length === 0 && (
          <div className="col-span-full text-center py-12 border-2 border-dashed rounded-lg">
            <h3 className="text-xl font-medium text-muted-foreground">No Players Found</h3>
            <p className="text-muted-foreground mt-2">Add a player to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
