'use client';

import { useParams, notFound } from 'next/navigation';
import { useDoc, useFirestore, useUser, useCollection, useMemoFirebase } from '@/firebase';
import { errorEmitter } from '@/firebase/error-emitter';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import type { GameSession_Firestore as RawGameSession, Player, RsvpStatus, Court, GameSession } from '@/lib/types';
import { handleCancellationAction } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { FirestorePermissionError } from '@/firebase/errors';
import { EditGameSessionSheet } from '@/components/edit-game-session-sheet';
import { normalizeAttendees } from '@/lib/session-attendees';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/user-avatar';
import { Calendar, MapPin, Users, UserCheck, UserX, Clock, LogOut, Loader2, Edit } from 'lucide-react';
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
import { Skeleton } from '@/components/ui/skeleton';


const statusInfo: { [key in RsvpStatus]: { icon: React.ElementType, text: string, color: string } } = {
  CONFIRMED: { icon: UserCheck, text: 'Confirmed', color: 'text-green-500' },
  PENDING: { icon: Clock, text: 'Pending', color: 'text-yellow-500' },
  DECLINED: { icon: UserX, text: 'Declined', color: 'text-red-500' },
};

const RSVP_PRIORITY: Record<RsvpStatus, number> = {
  DECLINED: 1,
  PENDING: 2,
  CONFIRMED: 3,
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


export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { toast } = useToast();
  const { user: currentUser } = useUser();
  const [isCancelling, setIsCancelling] = useState(false);
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
  const [allCourts, setAllCourts] = useState<Court[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const firestore = useFirestore();

  // Unwrap params Promise
  useEffect(() => {
    params.then((p) => setSessionId(p.id));
  }, [params]);

  // 1. Fetch the raw game session document
  const sessionRef = useMemoFirebase(
    () => (firestore && sessionId ? doc(firestore, 'game-sessions', sessionId) : null),
    [firestore, sessionId]
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
      
      try {
        const courtSnap = await getDoc(doc(firestore, 'courts', rawSession.courtId));
        const court = courtSnap.exists() ? { id: courtSnap.id, ...courtSnap.data() } as Court : { id: 'unknown', name: 'Unknown Court', location: '', ownerId: '' } as Court;
        
        const organizerSnap = await getDoc(doc(firestore, 'users', rawSession.organizerId));
        const organizer = organizerSnap.exists() ? { id: organizerSnap.id, ...organizerSnap.data() } as Player : { id: 'unknown', firstName: 'Unknown', lastName: 'Organizer', avatarUrl: '', email: '' } as Player;

        const attendees = normalizeAttendees(rawSession);
        const playerPromises = attendees.map(async ({ id, source }) => {
          const primaryCollection = source === 'player' ? 'players' : 'users';
          const secondaryCollection = source === 'player' ? 'users' : 'players';

          const primaryRef = doc(firestore, primaryCollection, id);
          let playerSnap = await getDoc(primaryRef);

          if (!playerSnap.exists()) {
            const secondaryRef = doc(firestore, secondaryCollection, id);
            playerSnap = await getDoc(secondaryRef);
          }

          let playerData: Player;

          if (playerSnap.exists()) {
            const data = playerSnap.data() as any;
            playerData = {
              id,
              ...data,
              email: data?.email ?? '',
            } as Player;
          } else {
            playerData = {
              id,
              firstName: source === 'player' ? 'Roster' : 'Unknown',
              lastName: 'Player',
              avatarUrl: '',
              email: '',
            } as Player;
          }

          if (source === 'user' && currentUser && id === currentUser.uid) {
            playerData = { ...playerData, isCurrentUser: true };
          }

          const playerStatusRef = doc(firestore, 'game-sessions', rawSession.id, 'players', id);
          const playerStatusSnap = await getDoc(playerStatusRef);
          const fallbackStatuses = (rawSession as Partial<RawGameSession> & {
            playerStatuses?: Record<string, RsvpStatus>;
          }).playerStatuses;
          const status = playerStatusSnap.exists()
            ? (playerStatusSnap.data().status as RsvpStatus)
            : (fallbackStatuses?.[id] ?? (id === rawSession.organizerId ? 'CONFIRMED' : 'PENDING'));

          return { player: playerData, status };
        });
        const players = await Promise.all(playerPromises);

        const dedupedPlayersMap = new Map<string, { player: Player; status: RsvpStatus }>();
        players.forEach((entry) => {
          const key = entry.player.id ?? `${entry.player.firstName}-${entry.player.lastName}`;
          const existing = dedupedPlayersMap.get(key);
          if (!existing || RSVP_PRIORITY[entry.status] >= RSVP_PRIORITY[existing.status]) {
            dedupedPlayersMap.set(key, entry);
          }
        });
        const normalizedPlayers = Array.from(dedupedPlayersMap.values());

        // TODO: Fetch alternates when that data model is finalized
        const alternates: Player[] = [];
        
        const sessionDate = rawSession.startTime?.toDate ? rawSession.startTime.toDate() : new Date();

        setHydratedSession({
          id: rawSession.id,
          court,
          organizer: {
              ...organizer,
              isCurrentUser: organizer.id === currentUser.uid,
          },
          date: sessionDate.toLocaleDateString([], { month: 'short', day: 'numeric' }),
          time: sessionDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          type: rawSession.isDoubles ? 'Doubles' : 'Singles',
          players: normalizedPlayers,
          alternates: alternates,
        });
      } catch (e: any) {
        console.error("Hydration error:", e);
        toast({
          variant: 'destructive',
          title: 'Error Loading Session',
          description: 'Could not load all session details. ' + (e?.message ?? ''),
        })
      } finally {
        setIsHydrating(false);
      }
    };

    hydrate();

  }, [rawSession, firestore, currentUser, isLoadingSession, toast]);

  // Fetch all courts for the edit sheet
  useEffect(() => {
    if (!firestore) return;
    (async () => {
      try {
        const courtsSnap = await getDocs(collection(firestore, 'courts'));
        const courts = courtsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Court));
        setAllCourts(courts);
      } catch (e) {
        console.error('Error fetching courts:', e);
      }
    })();
  }, [firestore]);

  const session = hydratedSession;

  const isOrganizer = session && currentUser && session.organizer.id === currentUser.uid;

  const onCancel = async () => {
    if (!session || !currentUser || !firestore) return;
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

        // Now, update the player's status in Firestore
        const playerStatusRef = doc(firestore, 'game-sessions', session.id, 'players', currentUser.uid);
        const payload = { status: 'DECLINED' };
        
        updateDoc(playerStatusRef, payload)
          .then(() => {
              toast({
                title: 'Cancellation Processed',
                description: result.message,
              });
          })
          .catch((error) => {
              const permissionError = new FirestorePermissionError({
                path: playerStatusRef.path,
                operation: 'update',
                requestResourceData: payload,
              });
              errorEmitter.emit('permission-error', permissionError);
              toast({
                  variant: 'destructive',
                  title: 'Update Failed',
                  description: 'Could not update your RSVP status. Check permissions.',
              });
          });

    } catch (error) {
       toast({
        variant: 'destructive',
        title: 'Cancellation Failed',
        description: 'The AI could not process the cancellation. Please try again.',
      });
    } finally {
        setIsCancelling(false);
    }
  }

  if (!sessionId || isLoadingSession || isHydrating) {
    return <SessionDetailSkeleton />;
  }

  if (!session) {
    notFound();
  }

  const currentUserInGame = session.players.find(p => p.player.id === currentUser?.uid);

  return (
    <>
      <EditGameSessionSheet
        open={isEditSheetOpen}
        onOpenChange={setIsEditSheetOpen}
        sessionId={rawSession?.id || null}
        sessionData={rawSession ? {
          courtId: rawSession.courtId,
          startTime: rawSession.startTime?.toDate() || new Date(),
          isDoubles: rawSession.isDoubles,
        } : null}
        courts={allCourts}
      />

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
            <CardContent className="space-y-3">
              {isOrganizer && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setIsEditSheetOpen(true)}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Session
                </Button>
              )}
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
              ) : !isOrganizer && (
                  <p className="text-sm text-muted-foreground">You are not in this game or have already declined.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
