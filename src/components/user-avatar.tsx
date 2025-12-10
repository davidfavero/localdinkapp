import type { Player } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface UserAvatarProps {
  player: Player;
  className?: string;
}

export function UserAvatar({ player, className }: UserAvatarProps) {
  // Build name from available fields
  const firstName = player.firstName || '';
  const lastName = player.lastName || '';
  const fullName = `${firstName} ${lastName}`.trim();
  const name = fullName || player.name || 'Unknown';
  
  // Build initials - handle edge cases
  const parts = name.split(' ').filter(p => p.length > 0);
  const fallback = parts.length >= 2 
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : (parts[0]?.substring(0, 2) || '??').toUpperCase();

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
