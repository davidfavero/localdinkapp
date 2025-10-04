import type { Player } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface UserAvatarProps {
  player: Player;
  className?: string;
}

export function UserAvatar({ player, className }: UserAvatarProps) {
  const fallback = player.name
    .split(' ')
    .map((n) => n[0])
    .join('');

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Avatar className={className}>
            <AvatarImage src={player.avatarUrl} alt={player.name} />
            <AvatarFallback>{fallback}</AvatarFallback>
          </Avatar>
        </TooltipTrigger>
        <TooltipContent>
          <p>{player.name}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
