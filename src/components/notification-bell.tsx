'use client';

import { useState } from 'react';
import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { NotificationCenter } from './notification-center';
import { useIsMobile } from '@/hooks/use-mobile';

interface NotificationBellProps {
  unreadCount: number;
  className?: string;
}

export function NotificationBell({ unreadCount, className }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  const bellButton = (
    <button
      className={cn(
        'relative p-2 rounded-full hover:bg-muted transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-primary/50',
        className
      )}
      aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      onClick={isMobile ? () => setOpen(true) : undefined}
    >
      <Bell className="h-5 w-5 text-muted-foreground" />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 animate-in zoom-in-50 duration-200">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );

  // On mobile, use a Sheet (bottom drawer) instead of Popover
  if (isMobile) {
    return (
      <>
        {bellButton}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="h-[80vh] rounded-t-2xl p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Notifications</SheetTitle>
            </SheetHeader>
            <NotificationCenter onClose={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      </>
    );
  }

  // On desktop, use Popover
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {bellButton}
      </PopoverTrigger>
      <PopoverContent 
        align="end" 
        className="w-80 sm:w-96 p-0"
        sideOffset={8}
      >
        <NotificationCenter onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

