'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { addDoc, collection } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
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

const courtSchema = z.object({
  name: z.string().min(1, 'Court name is required.'),
  location: z.string().min(1, 'Location is required.'),
});

type CourtFormValues = z.infer<typeof courtSchema>;

interface AddCourtSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddCourtSheet({ open, onOpenChange }: AddCourtSheetProps) {
  const { toast } = useToast();
  const firestore = useFirestore();

  const form = useForm<CourtFormValues>({
    resolver: zodResolver(courtSchema),
    defaultValues: {
      name: '',
      location: '',
    },
  });

  const { isSubmitting } = form.formState;

  const onSubmit = async (data: CourtFormValues) => {
    if (!firestore) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not connect to database. Please try again.',
      });
      return;
    }

    try {
      await addDoc(collection(firestore, 'courts'), data);

      toast({
        title: 'Court Added!',
        description: `${data.name} has been added to your courts.`,
      });
      form.reset();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error creating court:', error);
      toast({
        variant: 'destructive',
        title: 'Uh oh! Something went wrong.',
        description: error.message || 'Could not add the court.',
      });
    }
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
