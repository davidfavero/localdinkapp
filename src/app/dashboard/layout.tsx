'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { UsersRound, MapPin, MessageCircle } from 'lucide-react';
import { PickleballOutlineIcon } from '@/components/icons/pickleball-outline-icon';
import { RobinIcon } from '@/components/icons/robin-icon';
import { cn } from '@/lib/utils';
import { useUser } from '@/firebase/provider';
import { UserAvatar } from '@/components/user-avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { getClientAuth } from '@/firebase/auth';
import { setAuthTokenAction } from '@/lib/auth-actions';

const navItems = [
  { href: '/dashboard/sessions', icon: PickleballOutlineIcon, activeIcon: PickleballOutlineIcon, label: 'Game\nSessions' },
  { href: '/dashboard/messages', icon: MessageCircle, label: 'Player\nMessages' },
  { href: '/dashboard', icon: RobinIcon, label: 'Robin\nAI Assistant' },
  { href: '/dashboard/groups', icon: UsersRound, label: 'Players &\nGroups' },
  { href: '/dashboard/courts', icon: MapPin, label: 'My\nCourts' },
];

const getPageTitle = (pathname: string) => {
  if (pathname.startsWith('/dashboard/sessions/')) return 'Game Details';
  if (pathname === '/dashboard/sessions') return 'Game Sessions';
  if (pathname.startsWith('/dashboard/profile')) return 'Your Profile';
  if (pathname.startsWith('/dashboard/groups')) return 'Groups & Players';
  if (pathname.startsWith('/dashboard/messages')) return 'Messages';
  if (pathname === '/dashboard') return 'Robin';
  
  const item = navItems.find(item => item.href === pathname);

  return item ? item.label.replace('\n', ' ') : 'Dashboard';
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const pageTitle = getPageTitle(pathname);

  const { user, profile: currentUser, isUserLoading: isLoading } = useUser();
  
  useEffect(() => {
    // Sync auth token with server if user is authenticated client-side
    const syncAuthToken = async () => {
      if (user) {
        try {
          // Ensure we're in the browser and Firebase is available
          if (typeof window === 'undefined') {
            return;
          }
          const auth = getClientAuth();
          if (!auth || !auth.currentUser) {
            return;
          }
          const idToken = await auth.currentUser.getIdToken();
          if (idToken) {
            await setAuthTokenAction(idToken);
          }
        } catch (error) {
          // Silently handle errors - Firebase might not be initialized yet
          console.error('Error syncing auth token:', error);
        }
      }
    };
    
    syncAuthToken();
  }, [user]);
  
  useEffect(() => {
    // If auth is done loading and there's no user, redirect to login
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  // CRITICAL: Render a loading state while checking for auth
  // This prevents children from rendering and making unauthorized Firestore queries
  // We need both conditions: auth must be done loading AND user must exist
  if (isLoading) {
    return (
        <div className="flex items-center justify-center min-h-screen">
            <div className="flex flex-col items-center gap-4">
                <RobinIcon className="h-16 w-16 text-primary animate-pulse" />
                <p className="text-muted-foreground">Loading LocalDink...</p>
            </div>
        </div>
    );
  }
  
  // If auth is done loading but there's no user, show a brief loading state
  // while the redirect to /login happens
  if (!user) {
    return (
        <div className="flex items-center justify-center min-h-screen">
            <div className="flex flex-col items-center gap-4">
                <RobinIcon className="h-16 w-16 text-primary animate-pulse" />
                <p className="text-muted-foreground">Redirecting to login...</p>
            </div>
        </div>
    );
  }

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
        <div className="grid grid-cols-5 items-start justify-items-center gap-1 p-2">
          {navItems.map(({ href, icon: Icon, activeIcon: ActiveIcon, label }) => {
            const isRobin = label.startsWith('Robin');
            const isActive = !isRobin && (pathname === href || (pathname.startsWith(href) && href !== '/dashboard'));
            const [line1, line2] = label.split('\n');
            const CurrentIcon = isActive && ActiveIcon ? ActiveIcon : Icon;
            
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
                      'flex flex-col items-center justify-center gap-1 transition-all duration-300 transform text-center',
                       isRobinActive ? '-translate-y-4' : ''
                    )}>
                      <div className={cn(
                          "flex items-center justify-center rounded-full transition-all duration-300",
                          isRobinActive ? 'w-16 h-16 bg-primary shadow-lg' : 'w-12 h-12 bg-muted'
                      )}>
                         <Icon className={cn("transition-colors", isRobinActive ? 'w-10 h-10 text-accent' : 'w-6 h-6 text-muted-foreground')} />
                      </div>
                      {isRobinActive && (
                        <span className="text-xs font-semibold text-primary mt-1 whitespace-pre-line">
                            {line1}<br/>{line2}
                        </span>
                      )}
                    </div>
                  </Link>
                );
            }

            // Determine order for other icons
            const orderClass = {
                'Game\nSessions': 'order-1',
                'Player\nMessages': 'order-2',
                'Players &\nGroups': 'order-4',
                'My\nCourts': 'order-5',
            }[label] || '';

            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex flex-col items-center justify-center rounded-md p-1 w-full text-center',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                  orderClass
                )}
              >
                <CurrentIcon className="h-6 w-6 mb-1" />
                <span className="text-xs leading-tight whitespace-pre-line text-center">
                    {line1}<br />{line2}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
