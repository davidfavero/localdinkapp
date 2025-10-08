'use client';

import { useParams, notFound } from 'next/navigation';
import { useDoc, useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import type { GameSession as RawGameSession, Player, RsvpStatus, Court, GameSession } from '@/lib/types';
import { useMemoFirebase } from '@/firebase/provider';
import { handleCancellationAction } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/user-avatar';
import { Calendar, MapPin, Users, UserCheck, UserX, Clock, LogOut, Loader2 } from 'lucide-react';
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
} from "@/components/ui/alert-dialog";
import { useUser } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';


const statusInfo: { [key in RsvpStatus]: { icon: React.ElementType, text: string, color: string } } = {
  CONFIRMED: { icon: UserCheck, text: 'Confirmed', color: 'text-green-500' },
  PENDING: { icon: Clock, text: 'Pending', color: 'text-yellow-500' },
  DECLINED: { icon: UserX, text: 'Declined', color: 'text-red-500' },
};

const SessionDetailSkeleton = () => (
  <div className="grid md:grid-cols-3 gap-6">
    <div className="md:col-span-2 space-y-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-3/4 mb-2" />
          <Skeleton className="h-6 w-1/2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-1/3" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-7 w-24" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    </div>
    <div className="md:col-span-1">
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    </div>
  </div>
);


export default function SessionDetailPage({ params }: { params: { id: string } }) {
  const { toast } = useToast();
  const { user: currentUser } = useUser();
  const [isCancelling, setIsCancelling] = useState(false);
  const firestore = useFirestore();

  // 1. Fetch the raw game session document
  const sessionRef = useMemoFirebase(
    () => (firestore && params.id ? doc(firestore, 'game-sessions', params.id) : null),
    [firestore, params.id]
  );
  const { data: rawSession, isLoading: isLoadingSession } = useDoc<RawGameSession>(sessionRef);

  const [hydratedSession, setHydratedSession] = useState<GameSession | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);

  // 2. Hydrate the session with details (court, players, organizer)
  useEffect(() => {
    if (!rawSession || !firestore || !currentUser) {
       if (!isLoadingSession) setIsHydrating(false);
      return;
    }

    const hydrate = async () => {
      setIsHydrating(true);

      const courtSnap = await getDoc(doc(firestore, 'courts', rawSession.courtId));
      const court = courtSnap.exists() ? { id: courtSnap.id, ...courtSnap.data() } as Court : { id: 'unknown', name: 'Unknown Court', location: '' };
      
      const organizerSnap = await getDoc(doc(firestore, 'users', rawSession.organizerId));
      const organizer = organizerSnap.exists() ? { id: organizerSnap.id, isCurrentUser: organizerSnap.id === currentUser.uid, ...organizerSnap.data() } as Player : { id: 'unknown', firstName: 'Unknown', lastName: 'Organizer', avatarUrl: '' } as Player;

      const playerPromises = (rawSession.playerIds || []).map(async (id: string) => {
        const playerSnap = await getDoc(doc(firestore, 'users', id));
        const playerData = playerSnap.exists() ? { id: playerSnap.id, isCurrentUser: playerSnap.id === currentUser.uid, ...playerSnap.data() } as Player : { id, firstName: 'Unknown', lastName: 'Player', avatarUrl: '' } as Player;
        // TODO: In a real app, status would come from `/game-sessions/{id}/players/{userId}`
        return { player: playerData, status: 'CONFIRMED' as const };
      });
      const players = await Promise.all(playerPromises);

      // TODO: Fetch alternates when that data model is finalized
      const alternates: Player[] = [];
      
      const sessionDate = rawSession.startTime?.toDate ? rawSession.startTime.toDate() : new Date();

      setHydratedSession({
        id: rawSession.id,
        court,
        organizer,
        date: sessionDate.toLocaleDateString([], { month: 'short', day: 'numeric' }),
        time: sessionDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        type: rawSession.isDoubles ? 'Doubles' : 'Singles',
        players: players,
        alternates: alternates,
      });
      setIsHydrating(false);
    };

    hydrate();

  }, [rawSession, firestore, currentUser, isLoadingSession]);

  const session = hydratedSession;

  const onCancel = async () => {
    if (!session || !currentUser) return;
    const currentUserPlayer = session.players.find(p => p.player.id === currentUser.uid)?.player;
    if (!currentUserPlayer) return;

    setIsCancelling(true);

    try {
      const result = await handleCancellationAction({
        gameSessionId: session.id,
        cancelledPlayerName: `${currentUserPlayer.firstName} ${currentUserPlayer.lastName}`,
        alternates: session.alternates.map(p => ({ name: `${p.firstName} ${p.lastName}`, phone: p.phone || '' })),
        originalPlayerNames: session.players.map(p => `${p.player.firstName} ${p.player.lastName}`),
        courtName: session.court.name,
        gameTime: `${session.date} at ${session.time}`,
      });
      toast({
        title: 'Cancellation Processed',
        description: result.message,
      });
      // TODO: Update the user's status in Firestore to 'DECLINED'
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

  if (isLoadingSession || isHydrating) {
    return <SessionDetailSkeleton />;
  }

  if (!session) {
    notFound();
  }

  const currentUserInGame = session.players.find(p => p.player.id === currentUser.uid);

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
            <p className="text-sm text-muted-foreground">Organized by {session.organizer.isCurrentUser ? 'You' : `${session.organizer.firstName} ${session.organizer.lastName}`}</p>
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
                const playerName = player.firstName ? `${player.firstName} ${player.lastName}` : (player.name || 'Unknown Player');
                return (
                  <li key={player.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <UserAvatar player={player} />
                      <span className="font-semibold">{playerName} {player.isCurrentUser ? '(You)' : ''}</span>
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
                    <span className="text-sm">{player.firstName} {player.lastName}</span>
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
                    {isCancelling ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <LogOut className="mr-2 h-4 w-4" />
                    )}
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

    