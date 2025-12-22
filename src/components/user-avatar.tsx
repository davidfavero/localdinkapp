import type { Player } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { RobinIcon } from '@/components/icons/robin-icon';
import { cn } from '@/lib/utils';

interface UserAvatarProps {
  player: Player;
  className?: string;
  showVerifiedBadge?: boolean; // Override to show/hide badge
}

export function UserAvatar({ player, className, showVerifiedBadge }: UserAvatarProps) {
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

  // Show verified badge if player is linked to a registered user
  const isVerified = showVerifiedBadge !== undefined 
    ? showVerifiedBadge 
    : !!player.linkedUserId || !!player.isCurrentUser;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative inline-block">
            <Avatar className={className}>
              <AvatarImage src={player.avatarUrl} alt={name} />
              <AvatarFallback>{fallback}</AvatarFallback>
            </Avatar>
            {isVerified && (
              <div 
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 rounded-full bg-primary p-0.5 ring-2 ring-background",
                  "flex items-center justify-center"
                )}
                style={{ width: '35%', height: '35%', minWidth: '12px', minHeight: '12px' }}
              >
                <RobinIcon className="h-full w-full text-primary-foreground" />
              </div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{name}{isVerified && ' ✓'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
