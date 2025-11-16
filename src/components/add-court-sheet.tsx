'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { addDoc, collection } from 'firebase/firestore';
import { useFirestore, useFirebase } from '@/firebase';
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
import { FirestorePermissionError } from '@/firebase/errors';

const courtSchema = z.object({
  name: z.string().min(1, 'Court name is required.'),
  location: z.string().min(1, 'Location is required.'),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
});

type CourtFormValues = z.infer<typeof courtSchema>;

interface AddCourtSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddCourtSheet({ open, onOpenChange }: AddCourtSheetProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user: authUser } = useFirebase();

  const form = useForm<CourtFormValues>({
    resolver: zodResolver(courtSchema),
    defaultValues: {
      name: '',
      location: '',
      address: '',
      city: '',
      state: '',
      zipCode: '',
    },
  });

  const { isSubmitting, setFocus } = form.formState;

  const onSubmit = (data: CourtFormValues) => {
    if (!firestore || !authUser) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'You must be logged in to add a court.',
      });
      return;
    }

    const payload = {
      ...data,
      ownerId: authUser.uid,
    };

    const courtsRef = collection(firestore, 'courts');
    addDoc(courtsRef, payload)
      .then(() => {
        toast({
          title: 'Court Added!',
          description: `${data.name} has been added to your courts.`,
        });
        form.reset();
        onOpenChange(false);
      })
      .catch((error) => {
        const permissionError = new FirestorePermissionError({
          path: courtsRef.path,
          operation: 'create',
          requestResourceData: data,
        });
        errorEmitter.emit('permission-error', permissionError);
        toast({
          variant: 'destructive',
          title: 'Uh oh! Something went wrong.',
          description: 'Could not add the court. Check permissions.',
        });
      });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex h-full flex-col">
            <SheetHeader>
              <SheetTitle>Add a New Court</SheetTitle>
              <SheetDescription>
                Enter the details for the new pickleball court.
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-6 py-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Court Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Sunnyvale Park" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Sunnyvale, CA" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Street Address (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., 123 Main St" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Sunnyvale" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>State (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., CA" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="zipCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ZIP Code (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., 94086" {...field} />
                    </FormControl>
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
                {isSubmitting ? 'Adding...' : 'Add Court'}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
