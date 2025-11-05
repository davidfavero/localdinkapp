'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { updateDoc, deleteDoc, doc, collection, query, where } from 'firebase/firestore';
import { useFirestore, useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { errorEmitter } from '@/firebase/error-emitter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { FirestorePermissionError } from '@/firebase/errors';
import { UserAvatar } from '@/components/user-avatar';
import type { Player, Group } from '@/lib/types';
import { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';

const playerSchema = z.object({
  firstName: z.string().min(1, 'First name is required.'),
  lastName: z.string().min(1, 'Last name is required.'),
  email: z.string().email('Invalid email address.'),
  phone: z.string().optional(),
  groupIds: z.array(z.string()),
});

type PlayerFormValues = z.infer<typeof playerSchema>;

interface EditPlayerSheetProps {
  player: (Player & { id: string }) | null;
  groups: (Group & { id: string })[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditPlayerSheet({ player, groups, open, onOpenChange }: EditPlayerSheetProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user: authUser } = useFirebase();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Get current group memberships
  const currentGroupIds = groups?.filter(g => g.members?.includes(player?.id || ''))?.map(g => g.id) || [];

  const form = useForm<PlayerFormValues>({
    resolver: zodResolver(playerSchema),
    defaultValues: {
      firstName: player?.firstName || '',
      lastName: player?.lastName || '',
      email: player?.email || '',
      phone: player?.phone || '',
      groupIds: currentGroupIds,
    },
  });

  // Update form when player changes
  useEffect(() => {
    if (player) {
      const playerGroupIds = groups?.filter(g => g.members?.includes(player.id))?.map(g => g.id) || [];
      form.reset({
        firstName: player.firstName,
        lastName: player.lastName,
        email: player.email,
        phone: player.phone || '',
        groupIds: playerGroupIds,
      });
    }
  }, [player, groups, form]);

  const { isSubmitting } = form.formState;

  const onSubmit = async (data: PlayerFormValues) => {
    if (!firestore || !authUser || !player) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'You must be logged in to edit a player.',
      });
      return;
    }

    const payload = {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone || '',
    };

    const playerRef = doc(firestore, 'players', player.id);
    
    try {
      // Update player info
      await updateDoc(playerRef, payload);

      // Update group memberships
      const oldGroupIds = currentGroupIds;
      const newGroupIds = data.groupIds;
      
      // Remove from groups
      const groupsToRemoveFrom = oldGroupIds.filter(gid => !newGroupIds.includes(gid));
      for (const groupId of groupsToRemoveFrom) {
        const group = groups.find(g => g.id === groupId);
        if (group) {
          const groupRef = doc(firestore, 'groups', groupId);
          await updateDoc(groupRef, {
            members: group.members.filter(mid => mid !== player.id),
          });
        }
      }

      // Add to groups
      const groupsToAddTo = newGroupIds.filter(gid => !oldGroupIds.includes(gid));
      for (const groupId of groupsToAddTo) {
        const group = groups.find(g => g.id === groupId);
        if (group) {
          const groupRef = doc(firestore, 'groups', groupId);
          await updateDoc(groupRef, {
            members: [...(group.members || []), player.id],
          });
        }
      }

      toast({
        title: 'Player Updated!',
        description: `${data.firstName} ${data.lastName} has been updated.`,
      });
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error updating player:', error);
      const permissionError = new FirestorePermissionError({
        path: playerRef.path,
        operation: 'update',
        requestResourceData: payload,
      });
      errorEmitter.emit('permission-error', permissionError);
      toast({
        variant: 'destructive',
        title: 'Failed to update player',
        description: error.message,
      });
    }
  };

  const handleDelete = async () => {
    if (!firestore || !player) return;

    setIsDeleting(true);
    const playerRef = doc(firestore, 'players', player.id);
    
    try {
      // Remove from all groups first
      for (const group of groups) {
        if (group.members?.includes(player.id)) {
          const groupRef = doc(firestore, 'groups', group.id);
          await updateDoc(groupRef, {
            members: group.members.filter(mid => mid !== player.id),
          });
        }
      }

      // Delete player
      await deleteDoc(playerRef);
      
      toast({
        title: 'Player Deleted',
        description: `${player.firstName} ${player.lastName} has been deleted.`,
      });
      setShowDeleteDialog(false);
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error deleting player:', error);
      toast({
        variant: 'destructive',
        title: 'Failed to delete player',
        description: error.message,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (!player) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex h-full flex-col">
              <SheetHeader>
                <SheetTitle>Edit Player</SheetTitle>
                <SheetDescription>
                  Update player details and manage group memberships.
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 space-y-6 py-6 overflow-y-auto">
                <div className="flex justify-center">
                  <UserAvatar player={player} className="h-24 w-24" />
                </div>

                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="john.doe@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input type="tel" placeholder="(555) 123-4567" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="groupIds"
                  render={() => (
                    <FormItem>
                      <div className="mb-4">
                        <FormLabel>Group Memberships</FormLabel>
                        <FormDescription>
                          Select which groups this player belongs to.
                        </FormDescription>
                      </div>
                      {groups && groups.length > 0 ? (
                        <div className="space-y-2">
                          {groups.map((group) => (
                            <FormField
                              key={group.id}
                              control={form.control}
                              name="groupIds"
                              render={({ field }) => {
                                return (
                                  <FormItem
                                    key={group.id}
                                    className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3 hover:bg-accent"
                                  >
                                    <FormControl>
                                      <Checkbox
                                        checked={field.value?.includes(group.id)}
                                        onCheckedChange={(checked) => {
                                          return checked
                                            ? field.onChange([...field.value, group.id])
                                            : field.onChange(
                                                field.value?.filter(
                                                  (value) => value !== group.id
                                                )
                                              );
                                        }}
                                      />
                                    </FormControl>
                                    <FormLabel className="text-sm font-normal cursor-pointer flex-1">
                                      {group.name}
                                    </FormLabel>
                                  </FormItem>
                                );
                              }}
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No groups available. Create groups first.
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {!player.isCurrentUser && (
                  <div className="pt-4 border-t">
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => setShowDeleteDialog(true)}
                      className="w-full"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Player
                    </Button>
                  </div>
                )}
              </div>
              
              <SheetFooter>
                <SheetClose asChild>
                  <Button type="button" variant="outline" disabled={isSubmitting}>
                    Cancel
                  </Button>
                </SheetClose>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </Button>
              </SheetFooter>
            </form>
          </Form>
        </SheetContent>
      </Sheet>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {player.firstName} {player.lastName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this player and remove them from all groups.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

