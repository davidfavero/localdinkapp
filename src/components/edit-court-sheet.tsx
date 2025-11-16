'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { FirestorePermissionError } from '@/firebase/errors';
import type { Court } from '@/lib/types';
import { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';

const courtSchema = z.object({
  name: z.string().min(1, 'Court name is required.'),
  location: z.string().min(1, 'Location is required.'),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
});

type CourtFormValues = z.infer<typeof courtSchema>;

interface EditCourtSheetProps {
  court: (Court & { id: string }) | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditCourtSheet({ court, open, onOpenChange }: EditCourtSheetProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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

  // Update form when court changes
  useEffect(() => {
    if (court) {
      form.reset({
        name: court.name,
        location: court.location,
        address: court.address || '',
        city: court.city || '',
        state: court.state || '',
        zipCode: court.zipCode || '',
      });
    }
  }, [court, form]);

  const { isSubmitting } = form.formState;

  const onSubmit = async (data: CourtFormValues) => {
    if (!firestore || !court) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'You must be logged in to edit a court.',
      });
      return;
    }

    const payload = {
      name: data.name,
      location: data.location,
      address: data.address || '',
      city: data.city || '',
      state: data.state || '',
      zipCode: data.zipCode || '',
    };

    const courtRef = doc(firestore, 'courts', court.id);
    
    try {
      await updateDoc(courtRef, payload);
      toast({
        title: 'Court Updated!',
        description: `${data.name} has been updated.`,
      });
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error updating court:', error);
      const permissionError = new FirestorePermissionError({
        path: courtRef.path,
        operation: 'update',
        requestResourceData: payload,
      });
      errorEmitter.emit('permission-error', permissionError);
      toast({
        variant: 'destructive',
        title: 'Failed to update court',
        description: error.message,
      });
    }
  };

  const handleDelete = async () => {
    if (!firestore || !court) return;

    setIsDeleting(true);
    const courtRef = doc(firestore, 'courts', court.id);
    
    try {
      await deleteDoc(courtRef);
      toast({
        title: 'Court Deleted',
        description: `${court.name} has been deleted.`,
      });
      setShowDeleteDialog(false);
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error deleting court:', error);
      toast({
        variant: 'destructive',
        title: 'Failed to delete court',
        description: error.message,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (!court) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex h-full flex-col">
              <SheetHeader>
                <SheetTitle>Edit Court</SheetTitle>
                <SheetDescription>
                  Update court details and location information.
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 space-y-6 py-6 overflow-y-auto">
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

                <div className="pt-4 border-t">
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setShowDeleteDialog(true)}
                    className="w-full"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Court
                  </Button>
                </div>
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
            <AlertDialogTitle>Delete {court.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this court.
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

