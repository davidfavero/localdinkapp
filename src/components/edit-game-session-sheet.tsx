'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useFirestore, useUser } from '@/firebase';
import { doc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Trash2, CalendarIcon } from 'lucide-react';
import type { Court } from '@/lib/types';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const sessionSchema = z.object({
  courtId: z.string().min(1, 'Court is required'),
  date: z.date({
    required_error: 'Date is required',
  }),
  time: z.string().min(1, 'Time is required'),
  isDoubles: z.boolean(),
});

// Generate time options in 30-minute increments from 6:00 AM to 10:00 PM
const generateTimeOptions = () => {
  const times: string[] = [];
  for (let hour = 6; hour <= 22; hour++) {
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    const period = hour >= 12 ? 'PM' : 'AM';
    times.push(`${displayHour}:00 ${period}`);
    if (hour < 22) {
      times.push(`${displayHour}:30 ${period}`);
    }
  }
  return times;
};

const TIME_OPTIONS = generateTimeOptions();

type SessionFormData = z.infer<typeof sessionSchema>;

interface EditGameSessionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string | null;
  sessionData: {
    courtId: string;
    startTime: Date;
    isDoubles: boolean;
  } | null;
  courts: Court[];
}

export function EditGameSessionSheet({
  open,
  onOpenChange,
  sessionId,
  sessionData,
  courts,
}: EditGameSessionSheetProps) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<SessionFormData>({
    resolver: zodResolver(sessionSchema),
    defaultValues: {
      isDoubles: true,
    },
  });

  const selectedDate = watch('date');
  const selectedCourtId = watch('courtId');

  // Reset form when session data changes
  useEffect(() => {
    if (sessionData && open) {
      const startTime = sessionData.startTime;
      // Convert 24-hour format to 12-hour format with AM/PM
      const hours = startTime.getHours();
      const minutes = startTime.getMinutes();
      const displayHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
      const period = hours >= 12 ? 'PM' : 'AM';
      const formattedTime = `${displayHour}:${minutes.toString().padStart(2, '0')} ${period}`;
      
      reset({
        courtId: sessionData.courtId,
        date: startTime,
        time: formattedTime,
        isDoubles: sessionData.isDoubles,
      });
    }
  }, [sessionData, open, reset]);

  const onSubmit = async (data: SessionFormData) => {
    if (!firestore || !sessionId || !user) return;

    setIsSubmitting(true);

    try {
      // Parse time in "5:00 PM" format
      const [time, period] = data.time.split(' ');
      let [hours, minutes] = time.split(':').map(Number);
      
      if (period.toUpperCase() === 'PM' && hours < 12) {
        hours += 12;
      }
      if (period.toUpperCase() === 'AM' && hours === 12) {
        hours = 0;
      }
      
      const startDateTime = new Date(data.date);
      startDateTime.setHours(hours, minutes, 0, 0);

      const sessionRef = doc(firestore, 'game-sessions', sessionId);
      const payload = {
        courtId: data.courtId,
        startTime: Timestamp.fromDate(startDateTime),
        isDoubles: data.isDoubles,
      };

      await updateDoc(sessionRef, payload);

      toast({
        title: 'Session Updated!',
        description: 'The game session has been updated successfully.',
      });

      onOpenChange(false);
    } catch (error: any) {
      console.error('Error updating session:', error);
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: error?.message || 'Could not update the session. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!firestore || !sessionId) return;

    setIsDeleting(true);

    try {
      const sessionRef = doc(firestore, 'game-sessions', sessionId);
      await deleteDoc(sessionRef);

      toast({
        title: 'Session Deleted',
        description: 'The game session has been deleted successfully.',
      });

      setShowDeleteDialog(false);
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error deleting session:', error);
      toast({
        variant: 'destructive',
        title: 'Delete Failed',
        description: error?.message || 'Could not delete the session. Please try again.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="flex flex-col p-0 sm:p-6 h-full sm:max-w-lg">
          <SheetHeader className="flex-shrink-0 px-6 pt-6 sm:p-0">
            <SheetTitle>Edit Game Session</SheetTitle>
            <SheetDescription>
              Update session details, time, or location.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
            <div className="space-y-4 py-4 px-6 sm:px-0 flex-1 overflow-y-auto">
            {/* Court Selection */}
            <div className="space-y-2">
              <Label htmlFor="court">Court</Label>
              <Select
                value={selectedCourtId}
                onValueChange={(value) => setValue('courtId', value, { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a court" />
                </SelectTrigger>
                <SelectContent>
                  {courts.map((court) => (
                    <SelectItem key={court.id} value={court.id}>
                      {court.name} - {court.location}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.courtId && (
                <p className="text-sm text-destructive">{errors.courtId.message}</p>
              )}
            </div>

            {/* Date Selection */}
            <div className="space-y-2">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !selectedDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, 'PPP') : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setValue('date', date, { shouldValidate: true })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              {errors.date && (
                <p className="text-sm text-destructive">{errors.date.message}</p>
              )}
            </div>

            {/* Time Selection */}
            <div className="space-y-2">
              <Label htmlFor="time">Time</Label>
              <Select
                value={watch('time')}
                onValueChange={(value) => setValue('time', value, { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a time" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_OPTIONS.map((time) => (
                    <SelectItem key={time} value={time}>
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.time && (
                <p className="text-sm text-destructive">{errors.time.message}</p>
              )}
            </div>

            {/* Game Type */}
            <div className="space-y-2">
              <Label htmlFor="gameType">Game Type</Label>
              <Select
                value={watch('isDoubles') ? 'doubles' : 'singles'}
                onValueChange={(value) =>
                  setValue('isDoubles', value === 'doubles', { shouldValidate: true })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="doubles">Doubles</SelectItem>
                  <SelectItem value="singles">Singles</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Delete Button */}
            <Button
              type="button"
              variant="destructive"
              className="w-full"
              onClick={() => setShowDeleteDialog(true)}
              disabled={isSubmitting}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Session
            </Button>
            </div>

            <SheetFooter className="flex-shrink-0 pt-4 pb-4 px-6 sm:px-0 border-t bg-background sticky bottom-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
                className="flex-1 sm:flex-none"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1 sm:flex-none">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this game session. This action cannot be undone.
              All players will lose access to this session.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete Session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

