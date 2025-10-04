import { players } from '@/lib/data';
import { Card, CardContent } from '@/components/ui/card';
import { UserAvatar } from '@/components/user-avatar';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export default function PlayersPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">Your Players</h2>
        <Button>
          <Plus className="-ml-1 mr-2 h-4 w-4" />
          Add Player
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {players.map((player) => (
          <Card key={player.id} className="p-4">
            <CardContent className="flex items-center gap-4 p-0">
              <UserAvatar player={player} className="h-12 w-12" />
              <div>
                <p className="font-semibold">{player.name}</p>
                {player.isCurrentUser && (
                  <p className="text-sm text-muted-foreground">This is you</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
