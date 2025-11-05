'use client';

import { Card, CardContent } from '@/components/ui/card';
import { UserAvatar } from '@/components/user-avatar';
import { Button } from '@/components/ui/button';
import { Plus, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useCollection, useUser, useFirestore, useFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { Player, Group } from '@/lib/types';
import { useState, useMemo } from 'react';
import { AddPlayerSheet } from '@/components/add-player-sheet';
import { AddGroupSheet } from '@/components/add-group-sheet';
import { EditGroupSheet } from '@/components/edit-group-sheet';
import { EditPlayerSheet } from '@/components/edit-player-sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';

export default function GroupsAndPlayersPage() {
  const [isPlayerSheetOpen, setIsPlayerSheetOpen] = useState(false);
  const [isGroupSheetOpen, setIsGroupSheetOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<(Group & { id: string }) | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<(Player & { id: string }) | null>(null);
  const firestore = useFirestore();
  const { user: authUser } = useFirebase();  // Get user directly from FirebaseContext
  const { profile } = useUser();
  
  console.log('🔍 Direct auth user:', { authUser: authUser?.uid, hasUid: !!authUser?.uid });

  const groupsQuery = useMemo(() => {
    if (!firestore || !authUser?.uid) {
      console.log('⚠️ Groups query - no authUser yet');
      return null;
    }
    console.log('✅ Creating groups query for user:', authUser.uid);
    const q = query(collection(firestore, 'groups'), where('ownerId', '==', authUser.uid));
    (q as any).__memo = true;  // Mark for useCollection
    return q;
  }, [firestore, authUser?.uid]);
  const { data: groups, isLoading: isLoadingGroups } = useCollection<Group>(groupsQuery);
  
  // Fetch players from the players collection (contacts the user has added)
  const playersQuery = useMemo(() => {
    if (!firestore || !authUser?.uid) {
      console.log('⚠️ Players query - no authUser yet, authUser.uid:', authUser?.uid);
      return null;
    }
    console.log('✅ Creating players query for user:', authUser.uid);
    const q = query(collection(firestore, 'players'), where('ownerId', '==', authUser.uid));
    (q as any).__memo = true;  // Mark for useCollection
    return q;
  }, [firestore, authUser?.uid]);
  const { data: addedPlayers, isLoading: isLoadingPlayers, error: playersError } = useCollection<Player>(playersQuery);
  
  console.log('📊 Players state:', { 
    addedPlayers, 
    isLoadingPlayers, 
    playersError,
    queryExists: !!playersQuery,
    authUserUid: authUser?.uid
  });

  const getPlayerName = (player: Player) => {
    if (player.firstName && player.lastName) {
      return `${player.firstName} ${player.lastName}`;
    }
    return player.name || 'Unnamed Player';
  }

  // Memoize the list of players to display (current user + added players)
  const displayPlayers = useMemo(() => {
    const players: (Player & { id: string; isCurrentUser?: boolean })[] = [];
    
    // Add current user first
    if (profile && authUser) {
      players.push({
        ...profile,
        id: authUser.uid,
        isCurrentUser: true,
      });
    }
    
    // Add all other players
    if (addedPlayers) {
      players.push(...addedPlayers.map(p => ({
        ...p,
        isCurrentUser: false
      })));
    }
    
    // Sort: current user first, then alphabetically
    return players.sort((a, b) => {
      if (a.isCurrentUser) return -1;
      if (b.isCurrentUser) return 1;
      return (a.firstName || '').localeCompare(b.firstName || '');
    });
  }, [addedPlayers, profile, authUser]);

  return (
    <div className="space-y-8">
      <AddPlayerSheet open={isPlayerSheetOpen} onOpenChange={setIsPlayerSheetOpen} />
      <AddGroupSheet open={isGroupSheetOpen} onOpenChange={setIsGroupSheetOpen} />
      <EditGroupSheet 
        group={selectedGroup} 
        open={!!selectedGroup} 
        onOpenChange={(open) => !open && setSelectedGroup(null)} 
      />
      <EditPlayerSheet 
        player={selectedPlayer} 
        groups={groups || []}
        open={!!selectedPlayer} 
        onOpenChange={(open) => !open && setSelectedPlayer(null)} 
      />

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
          {groups?.map((group) => {
            const memberCount = group.members?.length || 0;
            return (
              <Card 
                key={group.id} 
                className="p-4 cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => setSelectedGroup(group)}
              >
                <CardContent className="flex items-center gap-4 p-0">
                  <Avatar className="h-12 w-12">
                      <AvatarImage src={group.avatarUrl} alt={group.name} />
                      <AvatarFallback>{group.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-semibold">{group.name}</p>
                    <p className="text-sm text-muted-foreground">{group.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {memberCount} {memberCount === 1 ? 'member' : 'members'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
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
          <h2 className="text-2xl font-bold font-headline">All Players</h2>
          <Button onClick={() => setIsPlayerSheetOpen(true)} variant="outline">
            <Plus className="-ml-1 mr-2 h-4 w-4" />
            Add Player
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(isLoadingPlayers || !authUser) &&
            Array.from({ length: 4 }).map((_, i) => (
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
          {displayPlayers?.map((player) => {
            // Find groups this player belongs to
            const playerGroups = groups?.filter(g => g.members?.includes(player.id)) || [];
            
            return (
              <Card 
                key={player.id} 
                className="p-4 cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => setSelectedPlayer(player)}
              >
                <CardContent className="flex items-center gap-4 p-0">
                  <UserAvatar player={player} className="h-12 w-12" />
                  <div className="flex-1">
                    <p className="font-semibold">{getPlayerName(player)}</p>
                    {player.isCurrentUser && (
                      <p className="text-sm text-muted-foreground">This is you</p>
                    )}
                    {playerGroups.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {playerGroups.map(group => (
                          <Badge key={group.id} variant="secondary" className="text-xs">
                            {group.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {!isLoadingPlayers && displayPlayers?.length === 0 && (
             <div className="col-span-full text-center py-12 border-2 border-dashed rounded-lg">
               <Users className="mx-auto h-12 w-12 text-muted-foreground" />
               <h3 className="text-xl font-medium text-muted-foreground mt-4">No Players Yet</h3>
               <p className="text-muted-foreground mt-2">Add players you frequently play with to your personal roster.</p>
                <Button onClick={() => setIsPlayerSheetOpen(true)} className="mt-4">
                   <Plus className="-ml-1 mr-2 h-4 w-4" />
                   Add Player
                </Button>
             </div>
          )}
           {playersError && (
             <div className="col-span-full text-center py-12 border rounded-lg bg-destructive/5 text-destructive">
                 <p className="font-medium">Error loading players: {playersError.message}</p>
             </div>
            )}
        </div>
      </section>
    </div>
  );
}
