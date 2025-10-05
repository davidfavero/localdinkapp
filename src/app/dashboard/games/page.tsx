import { GameSessionCard } from '@/components/game-session-card';
import { gameSessions } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export default function GamesPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">Upcoming Games</h2>
         <Button>
          <Plus className="-ml-1 mr-2 h-4 w-4" />
          New Game
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {gameSessions.map((session) => (
          <GameSessionCard key={session.id} session={session} />
        ))}
      </div>
    </div>
  );
}
