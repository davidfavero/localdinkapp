import type { Player } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface UserAvatarProps {
  player: Player;
  className?: string;
}

export function UserAvatar({ player, className }: UserAvatarProps) {
  const name = (player.firstName && player.lastName) ? `${player.firstName} ${player.lastName}`: player.name;
  
  const fallback = name
    .split(' ')
    .map((n) => n[0])
    .join('');

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Avatar className={className}>
            <AvatarImage src={player.avatarUrl} alt={name} />
            <AvatarFallback>{fallback}</AvatarFallback>
          </Avatar>
        </TooltipTrigger>
        <TooltipContent>
          <p>{name}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
