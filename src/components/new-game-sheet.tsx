'use client';

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { useAuth, useFirestore, useCollection } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { Court } from '@/lib/types';
import { useMemoFirebase } from '@/firebase/provider';

const gameSchema = z.object({
  courtId: z.string().min(1, 'Please select a court.'),
  date: z.date({ required_error: 'Please select a date.' }),
  time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:mm).'),
  isDoubles: z.boolean().default(true),
});

type GameFormValues = z.infer<typeof gameSchema>;

interface NewGameSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewGameSheet({ open, onOpenChange }: NewGameSheetProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useAuth();
  const [isCreating, setIsCreating] = useState(false);

  const courtsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'courts') : null),
    [firestore]
  );
  const { data: courts } = useCollection<Court>(courtsQuery);

  const form = useForm<GameFormValues>({
    resolver: zodResolver(gameSchema),
    defaultValues: {
      isDoubles: true,
      time: '17:00',
    },
  });

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = form;

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
      const [hours, minutes] = data.time.split(':').map(Number);
      const startTime = new Date(data.date);
      startTime.setHours(hours, minutes, 0, 0);

      await addDoc(collection(firestore, 'game-sessions'), {
        courtId: data.courtId,
        organizerId: user.uid,
        startTime: Timestamp.fromDate(startTime),
        isDoubles: data.isDoubles,
        durationMinutes: 120, // Default duration
        status: 'scheduled',
        playerIds: [user.uid] // Initially, only organizer is a player
      });

      toast({
        title: 'Game Created!',
        description: 'Your new game session has been scheduled.',
      });
      reset();
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
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 py-6">
          <Controller
            name="courtId"
            control={control}
            render={({ field }) => (
              <div className="space-y-1">
                <Label>Court</Label>
                <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!courts}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a court" />
                  </SelectTrigger>
                  <SelectContent>
                    {courts?.map((court) => (
                      <SelectItem key={court.id} value={court.id}>
                        {court.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.courtId && <p className="text-red-500 text-sm mt-1">{errors.courtId.message}</p>}
              </div>
            )}
          />

          <Controller
            name="date"
            control={control}
            render={({ field }) => (
              <div className="space-y-1">
                <Label>Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
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
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                {errors.date && <p className="text-red-500 text-sm mt-1">{errors.date.message}</p>}
              </div>
            )}
          />


          <div>
            <Label htmlFor="time">Time</Label>
            <Input id="time" type="time" {...register('time')} />
            {errors.time && <p className="text-red-500 text-sm mt-1">{errors.time.message}</p>}
          </div>

          <div>
            <Label>Game Type</Label>
            <div className="flex gap-4 mt-2">
                <Button type="button" variant={watch('isDoubles') ? 'default' : 'outline'} onClick={() => setValue('isDoubles', true)} className="flex-1">Doubles</Button>
                <Button type="button" variant={!watch('isDoubles') ? 'default' : 'outline'} onClick={() => setValue('isDoubles', false)} className="flex-1">Singles</Button>
            </div>
          </div>
          
          <SheetFooter>
            <SheetClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </SheetClose>
            <Button type="submit" disabled={isCreating}>
              {isCreating ? 'Creating...' : 'Create Game'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
