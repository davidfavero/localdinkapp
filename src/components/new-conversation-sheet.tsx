'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, MessageCircle, Users, Phone, Send, ArrowLeft } from 'lucide-react';
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
import { createConversationAction, sendDirectSmsAction } from '@/lib/actions';
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

  const [smsPlayer, setSmsPlayer] = useState<(Player & { id: string }) | null>(null);
  const [smsText, setSmsText] = useState('');
  const [isSendingSms, setIsSendingSms] = useState(false);
  const [smsMessages, setSmsMessages] = useState<{ sender: 'user'; text: string; sentAt: Date }[]>([]);
  const smsMessagesEndRef = useRef<HTMLDivElement>(null);

  // Show all players (with linked account or phone number), excluding self
  const messagePlayers = useMemo(() => {
    if (!players) return [];
    return players
      .filter(p => {
        if (p.linkedUserId === user?.uid) return false;
        if (p.isCurrentUser) return false;
        return p.linkedUserId || p.phone;
      })
      .filter(p => {
        if (!search) return true;
        const name = `${p.firstName} ${p.lastName}`.toLowerCase();
        return name.includes(search.toLowerCase());
      });
  }, [players, search, user]);

  const handleSelectPlayer = async (player: Player & { id: string }) => {
    if (!user || isCreating) return;

    // Player has a linked account → in-app conversation
    if (player.linkedUserId) {
      setIsCreating(true);
      try {
        const result = await createConversationAction({
          creatorId: user.uid,
          participantIds: [user.uid, player.linkedUserId],
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
      return;
    }

    // Player has phone only → show SMS chat view
    setSmsPlayer(player);
    setSmsText('');
    setSmsMessages([]);
  };

  // Auto-scroll SMS messages
  useEffect(() => {
    smsMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [smsMessages.length]);

  const handleSendSms = async () => {
    if (!smsPlayer?.phone || !smsText.trim() || !user || isSendingSms) return;
    const text = smsText.trim();
    setSmsText('');
    setIsSendingSms(true);

    // Optimistically add the message to the chat
    setSmsMessages(prev => [...prev, { sender: 'user', text, sentAt: new Date() }]);

    try {
      const senderName = user.displayName || 'A LocalDink player';
      const result = await sendDirectSmsAction({
        senderName,
        recipientPhone: smsPlayer.phone,
        text,
      });

      if (!result.success) {
        toast({ variant: 'destructive', title: 'Error', description: result.message });
        // Remove the optimistic message on failure
        setSmsMessages(prev => prev.slice(0, -1));
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
      setSmsMessages(prev => prev.slice(0, -1));
    } finally {
      setIsSendingSms(false);
    }
  };

  const handleSelectGroup = async (group: Group & { id: string }) => {
    if (!user || isCreating || !players) return;
    setIsCreating(true);

    try {
      // Gather all group members
      const memberPlayerIds = group.members || [];
      const registeredUserIds = new Set<string>();
      registeredUserIds.add(user.uid);

      for (const memberId of memberPlayerIds) {
        const player = players.find(p => p.id === memberId);
        if (player?.linkedUserId) {
          registeredUserIds.add(player.linkedUserId);
        }
      }

      // Need at least one other registered member for in-app conversation
      if (registeredUserIds.size < 2) {
        // All members are SMS-only — show a toast with guidance
        toast({
          title: 'SMS-only group',
          description: 'All members in this group use SMS. Select individual players to text them.',
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
    <Sheet open={open} onOpenChange={(val) => { if (!val) { setSmsPlayer(null); setSmsMessages([]); } onOpenChange(val); }}>
      <SheetContent side="bottom" className="h-[80vh] rounded-t-2xl p-0">
        {smsPlayer ? (
          /* ── SMS Chat View ── */
          <div className="flex flex-col h-full">
            {/* Header — matches conversation-detail.tsx */}
            <div className="flex items-center gap-3 p-4 border-b bg-background">
              <Button variant="ghost" size="icon" onClick={() => { setSmsPlayer(null); setSmsMessages([]); }} className="shrink-0">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <UserAvatar player={smsPlayer} className="h-9 w-9 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground truncate">
                  {smsPlayer.firstName} {smsPlayer.lastName}
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" /> SMS
                </p>
              </div>
            </div>

            {/* Messages area — native scroll like Robin chat */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1">
              {smsMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <Phone className="h-8 w-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Send an SMS to {smsPlayer.firstName}
                  </p>
                </div>
              ) : (
                <>
                  {smsMessages.map((msg, i) => {
                    const isLast = i === smsMessages.length - 1 || false;
                    return (
                      <div
                        key={i}
                        className={cn(
                          'flex items-end gap-2 justify-end',
                          isLast ? 'mb-3' : 'mb-0.5'
                        )}
                      >
                        <div className="max-w-xs md:max-w-md">
                          <div
                            className={cn(
                              'rounded-2xl px-3 py-2 text-sm bg-primary text-primary-foreground',
                              isLast && 'rounded-br-none'
                            )}
                          >
                            {msg.text}
                          </div>
                          {isLast && (
                            <p className="text-[10px] text-muted-foreground/50 mt-0.5 text-right mr-1">
                              Sent via SMS
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={smsMessagesEndRef} />
                </>
              )}
            </div>

            {/* Input bar — matches Robin chat & conversation-detail.tsx */}
            <div className="border-t bg-background/80 backdrop-blur-sm p-4 pb-24">
              <form
                onSubmit={(e) => { e.preventDefault(); handleSendSms(); }}
                className="flex items-center gap-2"
              >
                <Input
                  value={smsText}
                  onChange={(e) => setSmsText(e.target.value)}
                  placeholder={`Text ${smsPlayer.firstName}...`}
                  className="flex-1"
                  disabled={isSendingSms}
                  autoFocus
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!smsText.trim() || isSendingSms}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </div>
        ) : (
          /* ── Player/Group Picker ── */
          <div className="p-6 flex flex-col h-full">
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
                      <div className="flex-1 text-left">
                        <span className="text-sm font-medium">
                          {player.firstName} {player.lastName}
                        </span>
                      </div>
                      {!player.linkedUserId && (
                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          SMS
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    {search ? 'No players match your search.' : 'No players with phone numbers found.'}
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
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
