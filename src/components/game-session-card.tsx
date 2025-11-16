import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Calendar, MapPin } from 'lucide-react';
import type { GameSession, RsvpStatus } from '@/lib/types';
import { UserAvatar } from '@/components/user-avatar';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface GameSessionCardProps {
  session: GameSession;
}

const statusStyles: { [key in RsvpStatus]: string } = {
    CONFIRMED: 'border-green-500',
    PENDING: 'border-yellow-500',
    DECLINED: 'border-red-500 opacity-50',
};

const StatusBadge = ({ status }: { status: RsvpStatus }) => {
    const badgeStyles = {
        CONFIRMED: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/50 dark:text-green-300 dark:border-green-800',
        PENDING: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/50 dark:text-yellow-300 dark:border-yellow-800',
        DECLINED: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/50 dark:text-red-300 dark:border-red-800',
    };
    return <Badge variant="outline" className={cn('capitalize text-xs', badgeStyles[status])}>{status.toLowerCase()}</Badge>
}

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

export function GameSessionCard({ session }: GameSessionCardProps) {
  const confirmedPlayers = session.players.filter(p => p.status === 'CONFIRMED');

  return (
    <Link href={`/dashboard/sessions/${session.id}`} className="block">
      <Card className="hover:shadow-lg transition-shadow duration-300 h-full flex flex-col">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="font-headline text-xl mb-1">{session.court.name}</CardTitle>
              <CardDescription className="flex items-center gap-2">
                <MapPin className="h-4 w-4" /> {session.court.location}
              </CardDescription>
            </div>
            <Badge variant="secondary">{session.type}</Badge>
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
            <div className="text-sm text-muted-foreground">
                Organized by {getDisplayName(session.organizer)}
            </div>
        </CardContent>
      </Card>
    </Link>
  );
}
