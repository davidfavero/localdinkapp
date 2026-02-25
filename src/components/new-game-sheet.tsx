'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { collection, query, where } from 'firebase/firestore';
import { useAuth, useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from '@/components/ui/sheet';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { UserAvatar } from '@/components/user-avatar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { Court, Group, Player, RsvpStatus } from '@/lib/types';
import { createAttendee, uniqueAttendees } from '@/lib/session-attendees';

const gameSchema = z.object({
  courtId: z.string().min(1, 'Please select a court.'),
  date: z.date({ required_error: 'Please select a date.' }),
  time: z.string().min(1, 'Please select a time.'),
  isDoubles: z.string().default('true'),
  playerIds: z.array(z.string()).default([]),
  groupIds: z.array(z.string()).default([]),
});

// Generate time options in 30-minute increments from 6:00 AM to 10:00 PM
const generateTimeOptions = () => {
  const times: string[] = [];
  for (let hour = 6; hour <= 22; hour++) {
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    const period = hour >= 12 ? 'PM' : 'AM';
    times.push(`${displayHour}:00 ${period}`);
    if (hour < 22) {
      times.push(`${displayHour}:30 ${period}`);
    }
  }
  return times;
};

const TIME_OPTIONS = generateTimeOptions();

const PREVIEW_LIMIT = 6;

type GameFormValues = z.infer<typeof gameSchema>;

interface NewGameSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courts: Court[];
  isLoadingCourts: boolean;
}

export function NewGameSheet({ open, onOpenChange, courts, isLoadingCourts }: NewGameSheetProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useAuth();
  const [isCreating, setIsCreating] = useState(false);

  // Fetch only players owned by current user
  const playersQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'players'), where('ownerId', '==', user.uid));
  }, [firestore, user?.uid]);
  const { data: availablePlayers, isLoading: isLoadingPlayers } = useCollection<Player>(playersQuery);

  // Fetch only groups owned by current user
  const groupsQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'groups'), where('ownerId', '==', user.uid));
  }, [firestore, user?.uid]);
  const { data: availableGroups, isLoading: isLoadingGroups } = useCollection<Group>(groupsQuery);

  const playerMap = useMemo(() => {
    const map = new Map<string, Player>();
    (availablePlayers ?? []).forEach((player) => {
      map.set(player.id, player);
    });
    return map;
  }, [availablePlayers]);

  const groupMap = useMemo(() => {
    const map = new Map<string, Group>();
    (availableGroups ?? []).forEach((group) => {
      map.set(group.id, group);
    });
    return map;
  }, [availableGroups]);

  const form = useForm<GameFormValues>({
    resolver: zodResolver(gameSchema),
    defaultValues: {
      isDoubles: 'true',
      time: '05:00 PM',
      playerIds: [],
      groupIds: [],
    },
  });

  const selectedPlayerIds = form.watch('playerIds');
  const selectedGroupIds = form.watch('groupIds');

  const invitedAttendeeKeys = useMemo(() => {
    const keys = new Set<string>();
    if (user?.uid) {
      keys.add(`user:${user.uid}`);
    }
    (selectedPlayerIds ?? []).forEach((id) => {
      keys.add(`player:${id}`);
    });
    (selectedGroupIds ?? []).forEach((groupId) => {
      const group = groupMap.get(groupId);
      if (!group?.members) return;
      group.members.forEach((memberId) => {
        if (memberId) {
          keys.add(`player:${memberId}`);
        }
      });
    });
    return keys;
  }, [selectedPlayerIds, selectedGroupIds, groupMap, user?.uid]);

  const totalInvitedCount = invitedAttendeeKeys.size;

  const invitedPlayersPreview = useMemo(() => {
    const seen = new Set<string>();
    const preview: Player[] = [];

    (selectedPlayerIds ?? []).forEach((id) => {
      if (!id || seen.has(id)) return;
      const player = playerMap.get(id);
      if (player) {
        preview.push(player);
        seen.add(id);
      }
    });

    (selectedGroupIds ?? []).forEach((groupId) => {
      const group = groupMap.get(groupId);
      if (!group?.members) return;
      group.members.forEach((memberId) => {
        if (!memberId || seen.has(memberId)) return;
        const player = playerMap.get(memberId);
        if (player) {
          preview.push(player);
          seen.add(memberId);
        }
      });
    });

    return preview;
  }, [selectedPlayerIds, selectedGroupIds, playerMap, groupMap]);

  const previewPlayers = invitedPlayersPreview.slice(0, PREVIEW_LIMIT);
  const previewOverflow = Math.max(0, invitedPlayersPreview.length - PREVIEW_LIMIT);

  const onSubmit = async (data: GameFormValues) => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'You must be logged in to create a game session.',
      });
      return;
    }

    setIsCreating(true);

    const [time, period] = data.time.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    
    if (period.toUpperCase() === 'PM' && hours < 12) {
      hours += 12;
    }
    if (period.toUpperCase() === 'AM' && hours === 12) {
      hours = 0;
    }

    const startTime = new Date(data.date);
    startTime.setHours(hours, minutes, 0, 0);

    const directAttendees = (data.playerIds ?? []).map((id) => createAttendee(id, 'player'));
    const groupAttendees = (data.groupIds ?? []).flatMap((groupId) => {
      const group = groupMap.get(groupId);
      if (!group?.members) {
        console.warn('Group selected without members loaded', groupId);
        return [] as ReturnType<typeof createAttendee>[];
      }
      return group.members
        .filter((memberId): memberId is string => typeof memberId === 'string' && memberId.trim().length > 0)
        .map((memberId) => createAttendee(memberId, 'player'));
    });

    const attendees = uniqueAttendees([
      createAttendee(user.uid, 'user'),
      ...directAttendees,
      ...groupAttendees,
    ]);

    if (attendees.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Invite Required',
        description: 'Please add at least one player before creating a session.',
      });
      setIsCreating(false);
      return;
    }

    const playerStatuses = attendees.reduce((acc, attendee) => {
      const existing = acc[attendee.id];
      if (attendee.id === user.uid) {
        acc[attendee.id] = 'CONFIRMED';
      } else if (!existing) {
        acc[attendee.id] = 'PENDING';
      }
      return acc;
    }, {} as Record<string, RsvpStatus>);

    const playerIds = Array.from(new Set(attendees.map((attendee) => attendee.id)));
    const groupIds = Array.from(new Set(data.groupIds ?? []));

    const selectedCourt = courts.find((court) => court.id === data.courtId);

    const payload = {
      courtId: data.courtId,
      organizerId: user.uid,
      startTime: startTime.toISOString(),
      startTimeDisplay: format(startTime, "EEEE, MMMM d 'at' h:mm a"),
      courtName: selectedCourt?.name,
      courtLocation: selectedCourt?.location,
      isDoubles: data.isDoubles === 'true',
      durationMinutes: 120, // Default duration
      status: 'open',  // Must be: 'open' | 'full' | 'cancelled' | 'completed'
      playerIds,
      attendees,
      groupIds,
      playerStatuses,
    };

    try {
      const response = await fetch('/api/game-sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      let responseBody: any = null;
      try {
        responseBody = await response.json();
      } catch {
        responseBody = null;
      }

      if (!response.ok) {
        const message =
          responseBody?.error ?? 'Could not create the game session. Please try again.';
        throw new Error(message);
      }

      const notifiedCount = responseBody?.notifiedCount ?? 0;
      const notifiedDescription =
        notifiedCount > 0
          ? `Your new game session has been scheduled and ${notifiedCount} player${
              notifiedCount === 1 ? '' : 's'
            } were notified via SMS.`
          : 'Your new game session has been scheduled.';

      toast({
        title: 'Game Created!',
        description: notifiedDescription,
      });
      form.reset({
        isDoubles: 'true',
        time: '05:00 PM',
        courtId: '',
        date: undefined,
        playerIds: [],
        groupIds: [],
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to create game session:', error);
      toast({
        variant: 'destructive',
        title: 'Uh oh! Something went wrong.',
        description:
          error instanceof Error
            ? error.message
            : 'Could not create the game session. Check the server logs for details.',
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col p-0 sm:p-6 h-full sm:max-w-lg">
        <SheetHeader className="flex-shrink-0 px-6 pt-6 sm:p-0">
          <SheetTitle>Create a New Game</SheetTitle>
          <SheetDescription>
            Fill out the details below to schedule your next pickleball match.
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
            <div className="space-y-4 py-4 px-6 sm:px-0 flex-1 overflow-y-auto">
              <FormField
                control={form.control}
                name="courtId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Court</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isLoadingCourts}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={isLoadingCourts ? "Loading courts..." : "Select a court"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {courts?.map((court) => (
                          <SelectItem key={court.id} value={court.id}>
                            {court.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={'outline'}
                            className={cn(
                              'w-full justify-start text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? format(field.value, 'PPP') : <span>Pick a date</span>}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a time" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TIME_OPTIONS.map((time) => (
                          <SelectItem key={time} value={time}>
                            {time}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                  control={form.control}
                  name="isDoubles"
                  render={({ field }) => (
                      <FormItem>
                          <FormLabel>Game Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="true">Doubles</SelectItem>
                              <SelectItem value="false">Singles</SelectItem>
                            </SelectContent>
                          </Select>
                           <FormMessage />
                      </FormItem>
                  )}
              />

              <FormField
                control={form.control}
                name="playerIds"
                render={() => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Invite Players</FormLabel>
                      <span className="text-xs text-muted-foreground">
                        {(selectedPlayerIds?.length ?? 0)} selected
                      </span>
                    </div>
                    <FormDescription>
                      Choose from your saved players to add them to the session roster.
                    </FormDescription>
                    {isLoadingPlayers ? (
                      <p className="text-sm text-muted-foreground">Loading players...</p>
                    ) : (availablePlayers?.length ?? 0) > 0 ? (
                      <ScrollArea className="max-h-48 rounded-md border">
                        <div className="space-y-2 p-2">
                          {availablePlayers?.map((player) => (
                            <FormField
                              key={player.id}
                              control={form.control}
                              name="playerIds"
                              render={({ field }) => {
                                const value = field.value ?? [];
                                const isChecked = value.includes(player.id);
                                return (
                                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3 hover:bg-accent">
                                    <FormControl>
                                      <Checkbox
                                        checked={isChecked}
                                        onCheckedChange={(checked) => {
                                          if (checked) {
                                            field.onChange([...value, player.id]);
                                          } else {
                                            field.onChange(value.filter((id: string) => id !== player.id));
                                          }
                                        }}
                                      />
                                    </FormControl>
                                    <UserAvatar player={player} className="h-8 w-8" />
                                    <div className="flex-1 text-sm">
                                      <p className="font-medium">
                                        {player.firstName} {player.lastName}
                                      </p>
                                      {player.email && (
                                        <p className="text-xs text-muted-foreground">{player.email}</p>
                                      )}
                                    </div>
                                  </FormItem>
                                );
                              }}
                            />
                          ))}
                        </div>
                      </ScrollArea>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        You haven&apos;t added any players yet. Visit the Groups &amp; Players page to build your roster.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="groupIds"
                render={() => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Invite Groups</FormLabel>
                      <span className="text-xs text-muted-foreground">
                        {(selectedGroupIds?.length ?? 0)} selected
                      </span>
                    </div>
                    <FormDescription>
                      Adding a group automatically includes all of its members.
                    </FormDescription>
                    {isLoadingGroups ? (
                      <p className="text-sm text-muted-foreground">Loading groups...</p>
                    ) : (availableGroups?.length ?? 0) > 0 ? (
                      <ScrollArea className="max-h-48 rounded-md border">
                        <div className="space-y-2 p-2">
                          {availableGroups?.map((group) => (
                            <FormField
                              key={group.id}
                              control={form.control}
                              name="groupIds"
                              render={({ field }) => {
                                const value = field.value ?? [];
                                const isChecked = value.includes(group.id);
                                return (
                                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3 hover:bg-accent">
                                    <FormControl>
                                      <Checkbox
                                        checked={isChecked}
                                        onCheckedChange={(checked) => {
                                          if (checked) {
                                            field.onChange([...value, group.id]);
                                          } else {
                                            field.onChange(value.filter((id: string) => id !== group.id));
                                          }
                                        }}
                                      />
                                    </FormControl>
                                    <Avatar className="h-8 w-8">
                                      <AvatarImage src={group.avatarUrl} alt={group.name} />
                                      <AvatarFallback>{group.name.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 text-sm">
                                      <p className="font-medium">{group.name}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {(group.members?.length ?? 0)} member{(group.members?.length ?? 0) === 1 ? '' : 's'}
                                      </p>
                                    </div>
                                  </FormItem>
                                );
                              }}
                            />
                          ))}
                        </div>
                      </ScrollArea>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No groups yet. Create a group to invite the same players with one click.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">
                  Inviting {Math.max(totalInvitedCount, user?.uid ? 1 : 0)} player{Math.max(totalInvitedCount, user?.uid ? 1 : 0) === 1 ? '' : 's'} (including you)
                </p>
                {previewPlayers.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {previewPlayers.map((player) => (
                      <div
                        key={player.id}
                        className="flex items-center gap-2 rounded-full bg-background px-3 py-1 shadow-sm"
                      >
                        <UserAvatar player={player} className="h-6 w-6" />
                        <span className="text-xs font-medium text-foreground">
                          {player.firstName} {player.lastName}
                        </span>
                      </div>
                    ))}
                    {previewOverflow > 0 && (
                      <span className="text-xs text-muted-foreground">+ {previewOverflow} more</span>
                    )}
                  </div>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  The session organizer is always added automatically.
                </p>
              </div>
            </div>
            
            <SheetFooter className="flex-shrink-0 pt-4 pb-4 px-6 sm:px-0 border-t bg-background sticky bottom-0">
              <SheetClose asChild>
                <Button type="button" variant="outline" className="flex-1 sm:flex-none">Cancel</Button>
              </SheetClose>
              <Button type="submit" disabled={isCreating} className="flex-1 sm:flex-none">
                {isCreating ? 'Creating...' : 'Create Game'}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
