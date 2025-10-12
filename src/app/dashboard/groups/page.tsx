'use client';

import { Card, CardContent } from '@/components/ui/card';
import { UserAvatar } from '@/components/user-avatar';
import { Button } from '@/components/ui/button';
import { Plus, Users } from 'lucide-react';
import { useCollection, useUser } from '@/firebase';
import { collection, query } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import type { Player, Group } from '@/lib/types';
import { useMemoFirebase } from '@/firebase/provider';
import { useState } from 'react';
import { AddPlayerSheet } from '@/components/add-player-sheet';
import { AddGroupSheet } from '@/components/add-group-sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';

export default function GroupsAndPlayersPage() {
  const [isPlayerSheetOpen, setIsPlayerSheetOpen] = useState(false);
  const [isGroupSheetOpen, setIsGroupSheetOpen] = useState(false);
  const firestore = useFirestore();
  const { user, profile, isUserLoading } = useUser();

  const groupsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'groups'));
  }, [firestore]);
  const { data: groups, isLoading: isLoadingGroups } = useCollection<Group>(groupsQuery);
  
  const getPlayerName = (player: Player) => {
    if (player.firstName && player.lastName) {
      return `${player.firstName} ${player.lastName}`;
    }
    return player.name || 'Unnamed Player';
  }

  // Correctly use only the current user's profile for the player list
  const players = profile ? [profile] : [];
  const isLoadingPlayers = isUserLoading;

  return (
    <div className="space-y-8">
      <AddPlayerSheet open={isPlayerSheetOpen} onOpenChange={setIsPlayerSheetOpen} />
      <AddGroupSheet open={isGroupSheetOpen} onOpenChange={setIsGroupSheetOpen} />

      {/* Groups Section */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold font-headline">Groups</h2>
          <Button onClick={() => setIsGroupSheetOpen(true)} variant="outline">
            <Plus className="-ml-1 mr-2 h-4 w-4" />
            New Group
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {isLoadingGroups &&
            Array.from({ length: 3 }).map((_, i) => (
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
          {groups?.map((group) => (
            <Card key={group.id} className="p-4">
              <CardContent className="flex items-center gap-4 p-0">
                <Avatar className="h-12 w-12">
                    <AvatarImage src={group.avatarUrl} alt={group.name} />
                    <AvatarFallback>{group.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">{group.name}</p>
                   <p className="text-sm text-muted-foreground">{group.description}</p>
                </div>
              </CardContent>
            </Card>
          ))}
          {!isLoadingGroups && groups?.length === 0 && (
            <div className="col-span-full text-center py-12 border-2 border-dashed rounded-lg">
               <Users className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="text-xl font-medium text-muted-foreground mt-4">No Groups Yet</h3>
              <p className="text-muted-foreground mt-2">Create a group to easily schedule games with multiple players.</p>
               <Button onClick={() => setIsGroupSheetOpen(true)} className="mt-4">
                  <Plus className="-ml-1 mr-2 h-4 w-4" />
                  Create Group
               </Button>
            </div>
          )}
        </div>
      </section>

      <Separator />

      {/* Players Section */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold font-headline">Players</h2>
          <Button onClick={() => setIsPlayerSheetOpen(true)} variant="outline">
            <Plus className="-ml-1 mr-2 h-4 w-4" />
            Add Player
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {isLoadingPlayers &&
            Array.from({ length: 1 }).map((_, i) => (
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
          {!isLoadingPlayers && players?.length === 0 && (
            <div className="col-span-full text-center py-12 border-2 border-dashed rounded-lg">
              <Users className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="text-xl font-medium text-muted-foreground mt-4">No Players Found</h3>
              <p className="text-muted-foreground mt-2">Add a player to get started.</p>
              <Button onClick={() => setIsPlayerSheetOpen(true)} className="mt-4">
                  <Plus className="-ml-1 mr-2 h-4 w-4" />
                  Add Player
               </Button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
