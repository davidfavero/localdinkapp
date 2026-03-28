'use client';

import { useState, useMemo } from 'react';
import { Search, MessageCircle, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/user-avatar';
import { useUser, useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where } from 'firebase/firestore';
import { createConversationAction } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import type { Player, Group } from '@/lib/types';

interface NewConversationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConversationCreated: (id: string) => void;
}

export function NewConversationSheet({ open, onOpenChange, onConversationCreated }: NewConversationSheetProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Query user's player contacts
  const playersQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, 'players'),
      where('ownerId', '==', user.uid)
    );
  }, [firestore, user]);

  const { data: players, isLoading: isLoadingPlayers } = useCollection<Player>(playersQuery);

  // Query user's groups
  const groupsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, 'groups'),
      where('ownerId', '==', user.uid)
    );
  }, [firestore, user]);

  const { data: groups, isLoading: isLoadingGroups } = useCollection<Group>(groupsQuery);

  // Filter players: only those with linkedUserId (registered users)
  const messagePlayers = useMemo(() => {
    if (!players) return [];
    return players
      .filter(p => p.linkedUserId && p.linkedUserId !== user?.uid)
      .filter(p => {
        if (!search) return true;
        const name = `${p.firstName} ${p.lastName}`.toLowerCase();
        return name.includes(search.toLowerCase());
      });
  }, [players, search, user]);

  const handleSelectPlayer = async (player: Player & { id: string }) => {
    if (!user || isCreating) return;
    setIsCreating(true);

    try {
      const result = await createConversationAction({
        creatorId: user.uid,
        participantIds: [user.uid, player.linkedUserId!],
        type: '1:1',
      });

      if (result.success && result.conversationId) {
        onConversationCreated(result.conversationId);
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.message });
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setIsCreating(false);
    }
  };

  const handleSelectGroup = async (group: Group & { id: string }) => {
    if (!user || isCreating || !players) return;
    setIsCreating(true);

    try {
      // Gather all group members who are registered users
      const memberPlayerIds = group.members || [];
      const registeredUserIds = new Set<string>();
      registeredUserIds.add(user.uid); // Always include current user

      for (const memberId of memberPlayerIds) {
        const player = players.find(p => p.id === memberId);
        if (player?.linkedUserId) {
          registeredUserIds.add(player.linkedUserId);
        }
      }

      if (registeredUserIds.size < 2) {
        toast({
          variant: 'destructive',
          title: 'No registered members',
          description: 'This group has no other registered members to message.',
        });
        setIsCreating(false);
        return;
      }

      const result = await createConversationAction({
        creatorId: user.uid,
        participantIds: Array.from(registeredUserIds),
        type: 'group',
        groupName: group.name,
      });

      if (result.success && result.conversationId) {
        onConversationCreated(result.conversationId);
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.message });
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[80vh] rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>New Conversation</SheetTitle>
          <SheetDescription>
            Choose a player or group to message.
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="players" className="mt-4 flex flex-col h-[calc(100%-5rem)]">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="players">
              <MessageCircle className="mr-2 h-4 w-4" />
              Players
            </TabsTrigger>
            <TabsTrigger value="groups">
              <Users className="mr-2 h-4 w-4" />
              Groups
            </TabsTrigger>
          </TabsList>

          <TabsContent value="players" className="flex-1 mt-4 flex flex-col min-h-0">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search players..."
                className="pl-9"
              />
            </div>
            <ScrollArea className="flex-1">
              {isLoadingPlayers ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 p-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  ))}
                </div>
              ) : messagePlayers.length > 0 ? (
                <div className="space-y-1">
                  {messagePlayers.map(player => (
                    <button
                      key={player.id}
                      onClick={() => handleSelectPlayer(player as Player & { id: string })}
                      disabled={isCreating}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors disabled:opacity-50"
                    >
                      <UserAvatar player={player} className="h-10 w-10" />
                      <span className="text-sm font-medium">
                        {player.firstName} {player.lastName}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    {search ? 'No players match your search.' : 'No registered players to message. Players need a LocalDink account to receive messages.'}
                  </p>
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="groups" className="flex-1 mt-4 flex flex-col min-h-0">
            <ScrollArea className="flex-1">
              {isLoadingGroups ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 p-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  ))}
                </div>
              ) : groups && groups.length > 0 ? (
                <div className="space-y-1">
                  {groups.map(group => (
                    <button
                      key={group.id}
                      onClick={() => handleSelectGroup(group as Group & { id: string })}
                      disabled={isCreating}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors disabled:opacity-50"
                    >
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Users className="h-5 w-5 text-primary" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-medium">{group.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {group.members?.length || 0} members
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    No groups yet. Create groups in the Players & Groups tab.
                  </p>
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
