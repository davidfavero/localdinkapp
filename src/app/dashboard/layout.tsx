'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UsersRound, MapPin, MessageCircle } from 'lucide-react';
import { PickleballPaddleBallIcon } from '@/components/icons/pickleball-paddle-ball-icon';
import { RobinIcon } from '@/components/icons/robin-icon';
import { cn } from '@/lib/utils';
import { useCollection, useFirestore, useUser } from '@/firebase';
import { collection, query } from 'firebase/firestore';
import type { Player } from '@/lib/types';
import { useMemoFirebase } from '@/firebase/provider';
import { UserAvatar } from '@/components/user-avatar';
import { Skeleton } from '@/components/ui/skeleton';

const navItems = [
  { href: '/dashboard/games', icon: PickleballPaddleBallIcon, label: 'Games' },
  { href: '/dashboard/messages', icon: MessageCircle, label: 'Messages' },
  { href: '/dashboard', icon: RobinIcon, label: 'Robin' },
  { href: '/dashboard/groups', icon: UsersRound, label: 'Groups' },
  { href: '/dashboard/courts', icon: MapPin, label: 'Courts' },
];

const getPageTitle = (pathname: string) => {
  if (pathname.startsWith('/dashboard/sessions')) return 'Game Details';
  if (pathname.startsWith('/dashboard/profile')) return 'Your Profile';
  if (pathname.startsWith('/dashboard/groups')) return 'Groups & Players';
  if (pathname.startsWith('/dashboard/messages')) return 'Messages';
  if (pathname === '/dashboard') return 'Robin';
  
  const item = navItems.find(item => item.href === pathname);

  return item ? item.label : 'Dashboard';
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const pageTitle = getPageTitle(pathname);

  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const playersQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'users')) : null, [firestore]);
  const { data: players, isLoading: isLoadingPlayers } = useCollection<Player>(playersQuery);
  const currentUser = players?.find((p) => p.id === user?.uid);
  const isLoading = isUserLoading || isLoadingPlayers;


  return (
    <div className="flex flex-col min-h-screen w-full">
      <header className="sticky top-0 z-10 flex h-[60px] items-center justify-between gap-4 border-b bg-background/80 backdrop-blur-sm px-4">
          <h1 className="text-xl font-bold text-foreground font-headline">{pageTitle}</h1>
          <div className="flex items-center gap-4">
              <Link href="/dashboard/profile" className="h-8 w-8 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                {isLoading ? (
                  <Skeleton className="h-full w-full" />
                ) : currentUser ? (
                  <UserAvatar player={currentUser} className="h-full w-full text-lg" />
                ) : (
                  // Fallback if user is not found
                  <UsersRound className="h-5 w-5 text-muted-foreground" />
                )}
              </Link>
          </div>
       </header>

       <main className="flex-1 overflow-auto p-4 md:p-6 mb-20">
        {children}
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t bg-background/95 backdrop-blur-sm">
        <div className="grid grid-cols-5 items-center justify-items-center gap-1 p-2">
          {navItems.map(({ href, icon: Icon, label }) => {
            const isRobin = label === 'Robin';
            const isActive = !isRobin && (pathname === href || (pathname.startsWith(href) && href !== '/dashboard'));
            
            if (isRobin) {
                 const isRobinActive = pathname === '/dashboard';
                 return (
                  <Link
                    key={href}
                    href="/dashboard"
                    className={cn(
                      'flex flex-col items-center justify-center rounded-md p-1 w-full order-3'
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

            // Determine order for other icons
            const orderClass = {
                Games: 'order-1',
                Messages: 'order-2',
                Groups: 'order-4',
                Courts: 'order-5',
            }[label] || '';

            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex flex-col items-center justify-center rounded-md p-1 w-full',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                  orderClass
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
