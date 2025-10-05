'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageSquare, User, UsersRound, MapPin } from 'lucide-react';
import { PickleballPaddleBallIcon } from '@/components/icons/pickleball-paddle-ball-icon';
import { RobinIcon } from '@/components/icons/robin-icon';
import { cn } from '@/lib/utils';
import { GameSessionCard } from '@/components/game-session-card';
import { gameSessions } from '@/lib/data';

const navItems = [
  { href: '/dashboard/messages', icon: MessageSquare, label: 'Messages' },
  { href: '/dashboard/games', icon: PickleballPaddleBallIcon, label: 'Games' },
  { href: '/dashboard', icon: RobinIcon, label: 'Robin' },
  { href: '/dashboard/groups', icon: UsersRound, label: 'Groups' },
  { href: '/dashboard/profile', icon: User, label: 'Profile' },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  if (pathname === '/dashboard/games') {
    return (
      <div className="space-y-4 p-4">
        <h2 className="text-2xl font-bold tracking-tight">Upcoming Games</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {gameSessions.map((session) => (
            <GameSessionCard key={session.id} session={session} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen w-full">
      <main className="flex-1 overflow-auto pb-24">{children}</main>

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t bg-background/95 backdrop-blur-sm">
        <div className="grid grid-cols-5 items-center justify-items-center gap-1 p-2">
          {navItems.map(({ href, icon: Icon, label }) => {
            const isActive = pathname === href;
            const isRobin = label === 'Robin';
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex flex-col items-center justify-center rounded-md p-1 w-full',
                  !isRobin && (isActive ? 'text-primary' : 'text-muted-foreground')
                )}
              >
                {isRobin ? (
                  <div className={cn(
                    'flex flex-col items-center justify-center gap-1 transition-all duration-300 transform',
                     isActive ? '-translate-y-4' : ''
                  )}>
                    <div className={cn(
                        "flex items-center justify-center rounded-full transition-all duration-300",
                        isActive ? 'w-16 h-16 bg-primary shadow-lg' : 'w-12 h-12 bg-muted'
                    )}>
                       <Icon className={cn("transition-colors", isActive ? 'w-10 h-10 text-accent' : 'w-6 h-6 text-muted-foreground')} />
                    </div>
                    {isActive && <span className="text-xs font-semibold text-primary mt-1">{label}</span>}
                  </div>
                ) : (
                  <>
                    <Icon className="h-6 w-6" />
                    <span className="text-xs">{label}</span>
                  </>
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
