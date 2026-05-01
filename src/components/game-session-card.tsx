import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Calendar, MapPin, Check, X, Loader2, Repeat } from 'lucide-react';
import type { GameSession, RsvpStatus } from '@/lib/types';
import { UserAvatar } from '@/components/user-avatar';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

interface GameSessionCardProps {
  session: GameSession;
  currentUserStatus?: RsvpStatus;
  onAccept?: () => Promise<void>;
  onDecline?: () => Promise<void>;
}

const statusStyles: { [key in RsvpStatus]: string } = {
    CONFIRMED: 'border-green-500',
    PENDING: 'border-yellow-500',
    DECLINED: 'border-red-500 opacity-50',
};

const getDisplayName = (player: GameSession['organizer']) => {
  if (player.isCurrentUser) {
    return 'You';
  }
  const composed = `${player.firstName ?? ''} ${player.lastName ?? ''}`.trim();
  if (composed.length > 0) {
    return composed;
  }
  return (player as any)?.name ?? 'Unknown Organizer';
};

export function GameSessionCard({ session, currentUserStatus, onAccept, onDecline }: GameSessionCardProps) {
  const confirmedPlayers = session.players.filter(p => p.status === 'CONFIRMED');
  const [isAccepting, setIsAccepting] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);

  const handleAccept = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onAccept) return;
    setIsAccepting(true);
    try { await onAccept(); } finally { setIsAccepting(false); }
  };

  const handleDecline = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onDecline) return;
    setIsDeclining(true);
    try { await onDecline(); } finally { setIsDeclining(false); }
  };

  // Overall game confirmation status
  const allConfirmed = session.players.length > 0 && session.players.every(p => p.status === 'CONFIRMED');
  const unconfirmedCount = session.players.filter(p => p.status !== 'CONFIRMED' && p.status !== 'DECLINED').length;

  const cardContent = (
    <Card className={cn(
      'hover:shadow-lg transition-shadow duration-300 h-full flex flex-col overflow-hidden',
      currentUserStatus === 'DECLINED' && 'opacity-60',
      currentUserStatus === 'PENDING' && 'ring-2 ring-yellow-400/50',
    )}>
      {/* Confirmation status banner */}
      {allConfirmed ? (
        <div className="flex items-center justify-center gap-1.5 bg-green-600 text-white text-xs font-semibold py-1.5 px-3">
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
          All Players Confirmed
        </div>
      ) : unconfirmedCount > 0 ? (
        <div className="flex items-center justify-center gap-1.5 bg-yellow-500 text-white text-xs font-semibold py-1.5 px-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Awaiting Response ({unconfirmedCount})
        </div>
      ) : null}
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="font-headline text-xl mb-1">{session.court.name}</CardTitle>
            <CardDescription className="flex items-center gap-2">
              <MapPin className="h-4 w-4" /> {session.court.location}
            </CardDescription>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant="secondary">{session.type}</Badge>
            {session.recurring?.enabled && (
              <Badge variant="outline" className="text-xs gap-1">
                <Repeat className="h-3 w-3" />
                {session.recurring.frequency === 'weekly' ? 'Weekly' : 'Biweekly'}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-grow flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-4">
            <Calendar className="h-4 w-4" />
            <span>{session.date} at {session.time}</span>
          </div>

          <div className="mb-4">
            <h4 className="text-sm font-semibold mb-2">Players ({confirmedPlayers.length}/{session.players.length})</h4>
            <div className="flex items-center -space-x-2">
              {session.players.map(({ player, status }) => (
                <div key={player.id} className={cn('rounded-full transition-all', status === 'DECLINED' ? 'opacity-40 grayscale' : '')}>
                  <UserAvatar player={player} className={cn('border-2', statusStyles[status])}/>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Accept / Decline buttons for pending invites */}
        {currentUserStatus === 'PENDING' && onAccept && onDecline && (
          <div className="flex gap-2 mb-3">
            <Button
              size="sm"
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              onClick={handleAccept}
              disabled={isAccepting || isDeclining}
            >
              {isAccepting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
              onClick={handleDecline}
              disabled={isAccepting || isDeclining}
            >
              {isDeclining ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4 mr-1" />}
              Decline
            </Button>
          </div>
        )}

        <div className="text-sm text-muted-foreground">
          Organized by {getDisplayName(session.organizer)}
        </div>
      </CardContent>
    </Card>
  );

  // Don't wrap in Link if there are pending actions to avoid navigation conflicts
  if (currentUserStatus === 'PENDING' && onAccept && onDecline) {
    return <div className="block cursor-pointer">{cardContent}</div>;
  }

  return (
    <Link href={`/dashboard/sessions/${session.id}`} className="block">
      {cardContent}
    </Link>
  );
}
