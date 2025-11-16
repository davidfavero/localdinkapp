'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { addDoc, collection, query, where } from 'firebase/firestore';
import { useFirestore, useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { errorEmitter } from '@/firebase/error-emitter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from '@/components/ui/sheet';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { FirestorePermissionError } from '@/firebase/errors';
import { UserAvatar } from '@/components/user-avatar';
import type { Player, Court } from '@/lib/types';
import { useMemo, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const groupSchema = z.object({
  name: z.string().min(1, 'Group name is required.'),
  description: z.string().optional(),
  members: z.array(z.string()).min(1, 'Select at least one member.'),
  admins: z.array(z.string()).optional(),
  homeCourtId: z.string().optional(),
});

type GroupFormValues = z.infer<typeof groupSchema>;

interface AddGroupSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddGroupSheet({ open, onOpenChange }: AddGroupSheetProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user: authUser } = useFirebase();

  // Fetch available players
  const playersQuery = useMemoFirebase(() => {
    if (!authUser?.uid || !firestore) return null;
    return query(collection(firestore, 'players'), where('ownerId', '==', authUser.uid));
  }, [authUser?.uid, firestore]);
  const { data: availablePlayers } = useCollection<Player>(playersQuery);

  // Fetch available courts
  const courtsQuery = useMemoFirebase(() => {
    if (!authUser?.uid || !firestore) return null;
    return query(collection(firestore, 'courts'), where('ownerId', '==', authUser.uid));
  }, [authUser?.uid, firestore]);
  const { data: availableCourts } = useCollection<Court>(courtsQuery);

  const form = useForm<GroupFormValues>({
    resolver: zodResolver(groupSchema),
    defaultValues: {
      name: '',
      description: '',
      members: [],
      admins: [],
      homeCourtId: undefined,
    },
  });

  const { isSubmitting } = form.formState;

  const onSubmit = (data: GroupFormValues) => {
    if (!firestore || !authUser) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'You must be logged in to create a group.',
      });
      return;
    }

    const avatarIds = ['group1', 'group2', 'group3'];
    const randomAvatarId = avatarIds[Math.floor(Math.random() * avatarIds.length)];
    const randomAvatar = PlaceHolderImages.find(p => p.id === randomAvatarId);

    const payload = {
        name: data.name,
        description: data.description || '',
        members: data.members,
        ownerId: authUser.uid,
        admins: data.admins || [],
        homeCourtId: data.homeCourtId || undefined,
        avatarUrl: randomAvatar?.imageUrl || '',
    };

    const groupsRef = collection(firestore, 'groups');
    addDoc(groupsRef, payload)
      .then(() => {
        toast({
          title: 'Group Created!',
          description: `${data.name} has been created with ${data.members.length} member(s).`,
        });
        form.reset();
        onOpenChange(false);
      })
      .catch((error) => {
        console.error('Error creating group:', error);
        const permissionError = new FirestorePermissionError({
          path: groupsRef.path,
          operation: 'create',
          requestResourceData: payload,
        });
        errorEmitter.emit('permission-error', permissionError);
        toast({
          variant: 'destructive',
          title: 'Failed to create group',
          description: error.message,
        });
      });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex h-full flex-col">
            <SheetHeader>
              <SheetTitle>Create a New Group</SheetTitle>
              <SheetDescription>
                Groups make it easy to invite the same set of players to games.
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-6 py-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Group Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Weekend Warriors" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="A short description of your group." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="homeCourtId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Home Court (Optional)</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a home court" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableCourts && availableCourts.length > 0 ? (
                          availableCourts.map((court) => (
                            <SelectItem key={court.id} value={court.id}>
                              {court.name} - {court.location}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="none" disabled>
                            No courts available
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Default location for games with this group.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="members"
                render={() => (
                  <FormItem>
                    <div className="mb-4">
                      <FormLabel>Members</FormLabel>
                      <FormDescription>
                        Select players to add to this group.
                      </FormDescription>
                    </div>
                    {availablePlayers && availablePlayers.length > 0 ? (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {availablePlayers.map((player) => (
                          <FormField
                            key={player.id}
                            control={form.control}
                            name="members"
                            render={({ field }) => {
                              return (
                                <FormItem
                                  key={player.id}
                                  className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3 hover:bg-accent"
                                >
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(player.id)}
                                      onCheckedChange={(checked) => {
                                        return checked
                                          ? field.onChange([...field.value, player.id])
                                          : field.onChange(
                                              field.value?.filter(
                                                (value) => value !== player.id
                                              )
                                            );
                                      }}
                                    />
                                  </FormControl>
                                  <UserAvatar player={player} className="h-8 w-8" />
                                  <FormLabel className="text-sm font-normal cursor-pointer flex-1">
                                    {player.firstName} {player.lastName}
                                  </FormLabel>
                                </FormItem>
                              );
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No players available. Add players first to create a group.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="admins"
                render={() => (
                  <FormItem>
                    <div className="mb-4">
                      <FormLabel>Group Admins (Optional)</FormLabel>
                      <FormDescription>
                        Admins can manage the group and schedule games.
                      </FormDescription>
                    </div>
                    {availablePlayers && availablePlayers.length > 0 ? (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {availablePlayers.map((player) => (
                          <FormField
                            key={player.id}
                            control={form.control}
                            name="admins"
                            render={({ field }) => {
                              return (
                                <FormItem
                                  key={player.id}
                                  className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3 hover:bg-accent"
                                >
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(player.id)}
                                      onCheckedChange={(checked) => {
                                        return checked
                                          ? field.onChange([...(field.value || []), player.id])
                                          : field.onChange(
                                              field.value?.filter(
                                                (value) => value !== player.id
                                              )
                                            );
                                      }}
                                    />
                                  </FormControl>
                                  <UserAvatar player={player} className="h-8 w-8" />
                                  <FormLabel className="text-sm font-normal cursor-pointer flex-1">
                                    {player.firstName} {player.lastName}
                                  </FormLabel>
                                </FormItem>
                              );
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No players available to add as admins.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <SheetFooter>
              <SheetClose asChild>
                <Button type="button" variant="outline" disabled={isSubmitting}>
                  Cancel
                </Button>
              </SheetClose>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create Group'}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
