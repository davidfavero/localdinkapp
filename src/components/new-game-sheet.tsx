'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { useAuth, useFirestore } from '@/firebase';
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { Court } from '@/lib/types';

const gameSchema = z.object({
  courtId: z.string().min(1, 'Please select a court.'),
  date: z.date({ required_error: 'Please select a date.' }),
  time: z.string().regex(/^(0?[1-9]|1[0-2]):[0-5][0-9]\s(AM|PM)$/i, 'Invalid time format (e.g., 8:30 AM).'),
  isDoubles: z.string().default('true'),
});

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

  const form = useForm<GameFormValues>({
    resolver: zodResolver(gameSchema),
    defaultValues: {
      isDoubles: 'true',
      time: '05:00 PM',
    },
  });

  const onSubmit = async (data: GameFormValues) => {
    if (!firestore || !user) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not connect to database. Please try again.',
      });
      return;
    }

    setIsCreating(true);

    try {
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

      await addDoc(collection(firestore, 'game-sessions'), {
        courtId: data.courtId,
        organizerId: user.uid,
        startTime: Timestamp.fromDate(startTime),
        isDoubles: data.isDoubles === 'true',
        durationMinutes: 120, // Default duration
        status: 'scheduled',
        playerIds: [user.uid] // Initially, only organizer is a player
      });

      toast({
        title: 'Game Created!',
        description: 'Your new game session has been scheduled.',
      });
      form.reset({ isDoubles: 'true', time: '05:00 PM', courtId: '', date: undefined });
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error creating game:', error);
      toast({
        variant: 'destructive',
        title: 'Uh oh! Something went wrong.',
        description: error.message || 'Could not create the game session.',
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Create a New Game</SheetTitle>
          <SheetDescription>
            Fill out the details below to schedule your next pickleball match.
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col h-full overflow-y-auto">
            <div className="space-y-6 py-6 flex-1">
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
                    <FormControl>
                      <Input type="text" placeholder="e.g., 5:00 PM" {...field} />
                    </FormControl>
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
            </div>
            
            <SheetFooter className="mt-auto pt-6">
              <SheetClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </SheetClose>
              <Button type="submit" disabled={isCreating}>
                {isCreating ? 'Creating...' : 'Create Game'}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
