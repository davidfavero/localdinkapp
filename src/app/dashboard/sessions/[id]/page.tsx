'use client';

import { gameSessions, players as allPlayers } from '@/lib/data';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/user-avatar';
import { Calendar, MapPin, Users, UserCheck, UserX, Clock, LogOut } from 'lucide-react';
import type { Player, RsvpStatus } from '@/lib/types';
import { handleCancellationAction } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

const statusInfo: { [key in RsvpStatus]: { icon: React.ElementType, text: string, color: string } } = {
  CONFIRMED: { icon: UserCheck, text: 'Confirmed', color: 'text-green-500' },
  PENDING: { icon: Clock, text: 'Pending', color: 'text-yellow-500' },
  DECLINED: { icon: UserX, text: 'Declined', color: 'text-red-500' },
};

export default function SessionDetailPage({ params }: { params: { id: string } }) {
  const { toast } = useToast();
  const [isCancelling, setIsCancelling] = useState(false);
  const session = gameSessions.find((s) => s.id === params.id);
  const currentUser = allPlayers.find((p) => p.isCurrentUser);

  if (!session || !currentUser) {
    notFound();
  }

  const currentUserInGame = session.players.find(p => p.player.id === currentUser.id);

  const onCancel = async () => {
    if (!currentUserInGame) return;
    setIsCancelling(true);

    try {
      const result = await handleCancellationAction({
        gameSessionId: session.id,
        cancelledPlayerName: currentUser.name,
        alternatePlayerNames: session.alternates.map(p => p.name),
        originalPlayerNames: session.players.map(p => p.player.name),
        courtName: session.court.name,
        gameTime: `${session.date} at ${session.time}`,
      });
      toast({
        title: 'Cancellation Processed',
        description: result.message,
      });
    } catch (error) {
       toast({
        variant: 'destructive',
        title: 'Cancellation Failed',
        description: 'Could not process cancellation. Please try again.',
      });
    } finally {
        setIsCancelling(false);
    }
  }

  return (
    <div className="grid md:grid-cols-3 gap-6">
      <div className="md:col-span-2 space-y-6">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-3xl font-headline mb-2">{session.court.name}</CardTitle>
                <CardDescription className="flex items-center gap-4 text-base">
                  <span className="flex items-center gap-2"><MapPin className="h-4 w-4" /> {session.court.location}</span>
                  <span className="flex items-center gap-2"><Calendar className="h-4 w-4" /> {session.date} at {session.time}</span>
                </CardDescription>
              </div>
              <Badge variant="secondary" className="text-lg">{session.type}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Organized by {session.organizer.name}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-6 w-6" /> Players
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-4">
              {session.players.map(({ player, status }) => {
                const StatusIcon = statusInfo[status].icon;
                return (
                  <li key={player.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <UserAvatar player={player} />
                      <span className="font-semibold">{player.name} {player.isCurrentUser ? '(You)' : ''}</span>
                    </div>
                    <div className={cn("flex items-center gap-2 text-sm", statusInfo[status].color)}>
                      <StatusIcon className="h-5 w-5" />
                      <span>{statusInfo[status].text}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        {session.alternates.length > 0 && (
           <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Alternates
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                {session.alternates.map((player) => (
                  <div key={player.id} className="flex items-center gap-2">
                    <UserAvatar player={player} className="h-8 w-8" />
                    <span className="text-sm">{player.name}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="md:col-span-1 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent>
            {currentUserInGame && currentUserInGame.status !== 'DECLINED' ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="w-full" disabled={isCancelling}>
                    <LogOut className="mr-2 h-4 w-4" />
                    {isCancelling ? 'Cancelling...' : 'Cancel My Spot'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure you want to cancel?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will notify the organizer and Robin will attempt to find a replacement from the alternates list.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Nevermind</AlertDialogCancel>
                    <AlertDialogAction onClick={onCancel}>Yes, Cancel My Spot</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
                <p className="text-sm text-muted-foreground">You are not in this game or have already declined.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
