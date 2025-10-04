import { gameSessions } from '@/lib/data';
import { GameSessionCard } from '@/components/game-session-card';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export default function DashboardPage() {
  const upcomingSessions = gameSessions.filter(s => s.date === 'Today' || s.date === 'Tomorrow');
  const pastSessions = gameSessions.filter(s => s.date !== 'Today' && s.date !== 'Tomorrow');

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">Upcoming Sessions</h2>
        <Button>
          <Plus className="-ml-1 mr-2 h-4 w-4" />
          New Game
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {upcomingSessions.map((session) => (
          <GameSessionCard key={session.id} session={session} />
        ))}
      </div>

       <div>
        <h2 className="text-2xl font-bold tracking-tight mt-12 mb-4">Past Sessions</h2>
         <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 opacity-70">
            {pastSessions.map((session) => (
            <GameSessionCard key={session.id} session={session} />
            ))}
        </div>
      </div>
    </div>
  );
}
