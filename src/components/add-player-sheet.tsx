'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { addDoc, collection } from 'firebase/firestore';
import { useFirestore, errorEmitter, useUser } from '@/firebase';
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

  const onSubmit = (data: PlayerFormValues) => {
    if (!firestore || !user) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'You must be logged in to add a player.',
      });
      return;
    }
    
    const avatarIds = ['user2', 'user3', 'user4', 'user5', 'user6', 'user7', 'user8'];
    const randomAvatarId = avatarIds[Math.floor(Math.random() * avatarIds.length)];
    const randomAvatar = PlaceHolderImages.find(p => p.id === randomAvatarId);
    
    const payload = {
        ...data,
        ownerId: user.uid, // Add ownerId to establish ownership
        avatarUrl: randomAvatar?.imageUrl || '',
    };

    const usersRef = collection(firestore, 'users');
    addDoc(usersRef, payload)
      .then(() => {
        toast({
          title: 'Player Added!',
          description: `${data.firstName} ${data.lastName} has been added to your players.`,
        });
        form.reset();
        onOpenChange(false);
      })
      .catch((error) => {
        const permissionError = new FirestorePermissionError({
          path: usersRef.path,
          operation: 'create',
          requestResourceData: payload,
        });
        errorEmitter.emit('permission-error', permissionError);
        toast({
          variant: 'destructive',
          title: 'Uh oh! Something went wrong.',
          description: 'Could not add the player. Check permissions.',
        });
      });
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
