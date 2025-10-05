'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useAuth, useFirestore, useCollection } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
import { Calendar as CalendarIcon, Users } from 'lucide-react';
import { format } from 'date-fns';
import type { Court, Player } from '@/lib/types';
import { useMemoFirebase } from '@/firebase/provider';

const gameSchema = z.object({
  courtId: z.string().min(1, 'Please select a court.'),
  date: z.date({ required_error: 'Please select a date.' }),
  time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:mm).'),
  isDoubles: z.boolean().default(true),
});

type GameFormValues = z.infer<typeof gameSchema>;

interface NewGameSheetProps {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewGameSheet({ children, open, onOpenChange }: NewGameSheetProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

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
  const dateValue = watch('date');

  const onSubmit = async (data: GameFormValues) => {
    if (!firestore || !user) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not connect to database. Please try again.',
      });
      return;
    }

    setIsLoading(true);

    try {
      const [hours, minutes] = data.time.split(':').map(Number);
      const startTime = new Date(data.date);
      startTime.setHours(hours, minutes);

      await addDoc(collection(firestore, 'game-sessions'), {
        courtId: data.courtId,
        organizerId: user.uid,
        startTime: serverTimestamp(), // Will be set to the server's time
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
      setIsLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {children}
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Create a New Game</SheetTitle>
          <SheetDescription>
            Fill out the details below to schedule your next pickleball match.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 py-6">
          <div>
            <Label htmlFor="courtId">Court</Label>
            <Select onValueChange={(value) => setValue('courtId', value)} disabled={!courts}>
              <SelectTrigger id="courtId">
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

          <div>
            <Label>Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={'outline'}
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !dateValue && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateValue ? format(dateValue, 'PPP') : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={dateValue}
                  onSelect={(day) => day && setValue('date', day)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            {errors.date && <p className="text-red-500 text-sm mt-1">{errors.date.message}</p>}
          </div>

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
              <Button variant="outline">Cancel</Button>
            </SheetClose>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Creating...' : 'Create Game'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}