'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { UsersRound, MapPin, MessageCircle, LogOut, User } from 'lucide-react';
import { PickleballOutlineIcon } from '@/components/icons/pickleball-outline-icon';
import { RobinIcon } from '@/components/icons/robin-icon';
import { cn } from '@/lib/utils';
import { useUser, useFirestore, useMemoFirebase } from '@/firebase/provider';
import { UserAvatar } from '@/components/user-avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getClientAuth, signOutUser } from '@/firebase/auth';
import { setAuthTokenAction, clearAuthToken } from '@/lib/auth-actions';
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { useCollection } from '@/firebase/firestore/use-collection';
import { NewUserWizard } from '@/components/new-user-wizard';
import { NotificationBell } from '@/components/notification-bell';
import type { Notification } from '@/lib/types';

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
  const firestore = useFirestore();
  
  // Query for pending invites (sessions where user is invited with PENDING status)
  const invitesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, 'game-sessions'),
      where('playerIds', 'array-contains', user.uid)
    );
  }, [firestore, user]);
  
  const { data: invitedSessions } = useCollection<any>(invitesQuery);
  
  // Count pending invites where user hasn't responded yet (PENDING status)
  const pendingInviteCount = useMemo(() => {
    if (!invitedSessions || !user) return 0;
    return invitedSessions.filter(session => {
      // Only count if user is NOT the organizer and status is PENDING
      if (session.organizerId === user.uid) return false;
      const status = session.playerStatuses?.[user.uid];
      return status === 'PENDING';
    }).length;
  }, [invitedSessions, user]);
  
  // Query for unread notifications - wrapped to handle errors gracefully
  const notificationsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    // Simple query without compound filters to avoid index requirements
    return query(
      collection(firestore, 'notifications'),
      where('userId', '==', user.uid),
      limit(50)
    );
  }, [firestore, user]);
  
  const { data: notifications, error: notificationsError } = useCollection<Notification>(notificationsQuery);
  
  // Filter unread notifications client-side and handle errors gracefully
  const unreadCount = useMemo(() => {
    if (notificationsError) {
      console.warn('Could not load notifications:', notificationsError);
      return 0;
    }
    return notifications?.filter(n => !n.read).length || 0;
  }, [notifications, notificationsError]);
  
  // New user detection - show wizard if profile is incomplete
  const [showNewUserWizard, setShowNewUserWizard] = useState(false);
  const [hasCheckedNewUser, setHasCheckedNewUser] = useState(false);
  
  useEffect(() => {
    // Only check once after profile loads
    if (hasCheckedNewUser || isLoading || !currentUser) return;
    
    // Check if this is a new/incomplete user:
    // - Missing firstName (just has Google's displayName split)
    // - Has default/empty phone
    // - Check localStorage to see if they've already dismissed the wizard
    const wizardDismissedKey = `localdink-wizard-dismissed-${user?.uid}`;
    const wizardDismissed = typeof window !== 'undefined' && localStorage.getItem(wizardDismissedKey);
    
    if (!wizardDismissed) {
      // Consider showing wizard if profile seems incomplete
      const isIncomplete = !currentUser.phone;
      if (isIncomplete) {
        setShowNewUserWizard(true);
      }
    }
    
    setHasCheckedNewUser(true);
  }, [currentUser, isLoading, hasCheckedNewUser, user?.uid]);
  
  const handleWizardComplete = () => {
    setShowNewUserWizard(false);
    // Mark wizard as completed in localStorage
    if (user?.uid && typeof window !== 'undefined') {
      localStorage.setItem(`localdink-wizard-dismissed-${user.uid}`, 'true');
    }
  };
  
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
      {/* New User Onboarding Wizard */}
      <NewUserWizard open={showNewUserWizard} onComplete={handleWizardComplete} />
      
      <header className="sticky top-0 z-10 flex h-[60px] items-center justify-between gap-4 border-b bg-background/80 backdrop-blur-sm px-4">
          <h1 className="text-xl font-bold text-foreground font-headline">{pageTitle}</h1>
          <div className="flex items-center gap-2">
              {/* Notification Bell */}
              <NotificationBell unreadCount={unreadCount} />
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="h-8 w-8 rounded-full bg-muted flex items-center justify-center overflow-hidden hover:ring-2 hover:ring-primary/50 transition-all">
                    {isLoading ? (
                      <Skeleton className="h-full w-full" />
                    ) : currentUser ? (
                      <UserAvatar player={currentUser} className="h-full w-full text-lg" />
                    ) : (
                      <UsersRound className="h-5 w-5 text-muted-foreground" />
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/profile" className="flex items-center gap-2 cursor-pointer">
                      <User className="h-4 w-4" />
                      Your Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={async () => {
                      try {
                        signOutUser();
                        await clearAuthToken();
                        router.push('/login');
                      } catch (error) {
                        console.error('Error signing out:', error);
                      }
                    }}
                    className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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

            // Check if this is the Game Sessions nav item and has pending invites
            const showBadge = label === 'Game\nSessions' && pendingInviteCount > 0;
            
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
                <div className="relative">
                  <CurrentIcon className="h-6 w-6 mb-1" />
                  {showBadge && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                      {pendingInviteCount > 9 ? '9+' : pendingInviteCount}
                    </span>
                  )}
                </div>
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
