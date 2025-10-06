'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UsersRound, MapPin, User } from 'lucide-react';
import { PickleballPaddleBallIcon } from '@/components/icons/pickleball-paddle-ball-icon';
import { RobinIcon } from '@/components/icons/robin-icon';
import { cn } from '@/lib/utils';
import { GameSessionCard } from '@/components/game-session-card';
import { gameSessions } from '@/lib/data';

const navItems = [
  { href: '/dashboard/messages', icon: RobinIcon, label: 'Messages' },
  { href: '/dashboard/games', icon: PickleballPaddleBallIcon, label: 'Games' },
  { href: '/dashboard', icon: RobinIcon, label: 'Robin' },
  { href: '/dashboard/players', icon: UsersRound, label: 'Players' },
  { href: '/dashboard/courts', icon: MapPin, label: 'Courts' },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col min-h-screen w-full">
       <main className="flex-1 overflow-auto p-4 md:p-6 mb-20">
        {children}
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t bg-background/95 backdrop-blur-sm">
        <div className="grid grid-cols-5 items-center justify-items-center gap-1 p-2">
          {navItems.map(({ href, icon: Icon, label }) => {
            const isActive = pathname === href || (href === '/dashboard/messages' && pathname === '/dashboard');
            const isRobin = label === 'Robin' && href === '/dashboard';
            
            // Special handling to make Messages icon active on /dashboard too.
            if (label === 'Messages') {
                const isMessagesOrDashboard = pathname === '/dashboard/messages' || pathname === '/dashboard';
                 return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'flex flex-col items-center justify-center rounded-md p-1 w-full',
                      isMessagesOrDashboard ? 'text-primary' : 'text-muted-foreground'
                    )}
                  >
                    <Icon className="h-6 w-6" />
                    <span className="text-xs">{label}</span>
                  </Link>
                );
            }

            if (isRobin) {
                 const isRobinActive = pathname === '/dashboard';
                 return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'flex flex-col items-center justify-center rounded-md p-1 w-full'
                    )}
                  >
                    <div className={cn(
                      'flex flex-col items-center justify-center gap-1 transition-all duration-300 transform',
                       isRobinActive ? '-translate-y-4' : ''
                    )}>
                      <div className={cn(
                          "flex items-center justify-center rounded-full transition-all duration-300",
                          isRobinActive ? 'w-16 h-16 bg-primary shadow-lg' : 'w-12 h-12 bg-muted'
                      )}>
                         <Icon className={cn("transition-colors", isRobinActive ? 'w-10 h-10 text-accent' : 'w-6 h-6 text-muted-foreground')} />
                      </div>
                      {isRobinActive && <span className="text-xs font-semibold text-primary mt-1">{label}</span>}
                    </div>
                  </Link>
                );
            }

            // Default for other icons
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex flex-col items-center justify-center rounded-md p-1 w-full',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <Icon className="h-6 w-6" />
                <span className="text-xs">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
