import { groups } from '@/lib/data';
import { Card, CardContent } from '@/components/ui/card';
import { UserAvatar } from '@/components/user-avatar';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export default function GroupsPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">Your Groups</h2>
        <Button>
          <Plus className="-ml-1 mr-2 h-4 w-4" />
          Add Group
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {groups.map((group) => (
          <Card key={group.id} className="p-4 flex flex-col">
            <CardContent className="flex items-center gap-4 p-0">
              <Avatar className="h-12 w-12">
                <AvatarImage src={group.avatarUrl} alt={group.name} />
                <AvatarFallback>{group.name.charAt(0)}</AvatarFallback>
              </Avatar>

              <div>
                <p className="font-semibold">{group.name}</p>
                <p className="text-sm text-muted-foreground">{group.members.length} members</p>
              </div>
            </CardContent>
            <div className="flex items-center -space-x-2 mt-4">
                <TooltipProvider>
                    {group.members.map((player) => (
                        <Tooltip key={player.id}>
                            <TooltipTrigger>
                                <UserAvatar player={player} />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{player.name}</p>
                            </TooltipContent>
                        </Tooltip>
                    ))}
                </TooltipProvider>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
