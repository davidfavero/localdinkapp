'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { addDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase/provider';
import { errorEmitter } from '@/firebase/error-emitter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from '@/components/ui/sheet';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { FirestorePermissionError } from '@/firebase/errors';

const playerSchema = z.object({
  firstName: z.string().min(1, 'First name is required.'),
  lastName: z.string().min(1, 'Last name is required.'),
  email: z.string().email('Invalid email address.'),
  phone: z.string().optional(),
});

type PlayerFormValues = z.infer<typeof playerSchema>;

interface AddPlayerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddPlayerSheet({ open, onOpenChange }: AddPlayerSheetProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();

  const form = useForm<PlayerFormValues>({
    resolver: zodResolver(playerSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
    },
  });

  const { isSubmitting } = form.formState;

  const onSubmit = async (data: PlayerFormValues) => {
    if (!firestore || !user) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'You must be logged in to add a player.',
      });
      return;
    }
    
    try {
      // Check if this email matches an existing registered user
      let linkedUserId: string | undefined;
      let linkedUserData: { avatarUrl?: string; firstName?: string; lastName?: string } | undefined;
      
      if (data.email) {
        const usersQuery = query(
          collection(firestore, 'users'),
          where('email', '==', data.email.toLowerCase().trim())
        );
        const usersSnapshot = await getDocs(usersQuery);
        
        if (!usersSnapshot.empty) {
          const linkedUser = usersSnapshot.docs[0];
          linkedUserId = linkedUser.id;
          linkedUserData = linkedUser.data() as typeof linkedUserData;
          console.log('Found linked user:', linkedUserId);
        }
      }
      
      // Use linked user's data if available, otherwise use provided data
      const avatarIds = ['user2', 'user3', 'user4', 'user5', 'user6', 'user7', 'user8'];
      const randomAvatarId = avatarIds[Math.floor(Math.random() * avatarIds.length)];
      const randomAvatar = PlaceHolderImages.find(p => p.id === randomAvatarId);
      
      const payload = {
        firstName: linkedUserData?.firstName || data.firstName,
        lastName: linkedUserData?.lastName || data.lastName,
        email: data.email.toLowerCase().trim(),
        phone: data.phone || '',
        ownerId: user.uid,
        avatarUrl: linkedUserData?.avatarUrl || randomAvatar?.imageUrl || '',
        // Link to actual user account if found
        ...(linkedUserId && { linkedUserId }),
      };

      const playersRef = collection(firestore, 'players');
      console.log('Adding player to collection:', playersRef.path, 'Payload:', payload);
      const docRef = await addDoc(playersRef, payload);
      
      console.log('Player added successfully with ID:', docRef.id);
      toast({
        title: linkedUserId ? 'Player Linked!' : 'Player Added!',
        description: linkedUserId 
          ? `${payload.firstName} ${payload.lastName} is a registered user and has been linked to your contacts.`
          : `${data.firstName} ${data.lastName} has been added to your players.`,
      });
      form.reset();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error adding player - Full error:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      const permissionError = new FirestorePermissionError({
        path: 'players',
        operation: 'create',
      });
      errorEmitter.emit('permission-error', permissionError);
      toast({
        variant: 'destructive',
        title: 'Uh oh! Something went wrong.',
        description: `Could not add the player: ${error.message}`,
      });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
            <SheetHeader>
              <SheetTitle>Add a New Player</SheetTitle>
              <SheetDescription>
                Enter the details for the new player. They will be added to your player list.
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto pr-6 -mr-6 space-y-6 py-6">
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
                    <FormLabel>Phone Number (US)</FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="e.g., 555-123-4567" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <SheetFooter className="mt-auto">
              <SheetClose asChild>
                <Button type="button" variant="outline" disabled={isSubmitting}>
                  Cancel
                </Button>
              </SheetClose>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Adding...' : 'Add Player'}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
