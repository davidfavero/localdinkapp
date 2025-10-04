'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Users, MapPin, User, Menu, Plus, UsersRound } from 'lucide-react';
import { PickleballPaddleIcon } from '@/components/icons/pickleball-paddle-icon';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { UserAvatar } from '@/components/user-avatar';
import { players } from '@/lib/data';

const navItems = [
  { href: '/dashboard', icon: Home, label: 'Dashboard' },
  { href: '/dashboard/players', icon: Users, label: 'Players' },
  { href: '/dashboard/groups', icon: UsersRound, label: 'Groups' },
  { href: '/dashboard/courts', icon: MapPin, label: 'Courts' },
  { href: '/dashboard/profile', icon: User, label: 'Profile' },
];

const pageTitles: { [key: string]: string } = {
  '/dashboard': 'Dashboard',
  '/dashboard/players': 'Players',
  '/dashboard/groups': 'Groups',
  '/dashboard/courts': 'Courts',
  '/dashboard/profile': 'My Profile',
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const currentUser = players.find((p) => p.isCurrentUser);

  const getPageTitle = () => {
    if (pathname.startsWith('/dashboard/sessions/')) {
      return 'Game Session';
    }
    return pageTitles[pathname] || 'LocalDink';
  };
  
  const NavLinks = ({ isMobile = false }: { isMobile?: boolean }) => (
    <nav className={cn(isMobile ? 'flex flex-col gap-2' : 'flex flex-col gap-1')}>
      {navItems.map(({ href, icon: Icon, label }) => {
        const isActive = pathname === href;
        return (
          <Button
            key={href}
            asChild
            variant={isActive ? 'secondary' : 'ghost'}
            className={cn(
              'justify-start gap-3',
              isMobile ? 'text-base h-12' : 'h-10'
            )}
          >
            <Link href={href}>
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </Link>
          </Button>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen w-full bg-muted/40">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 flex-col border-r bg-background sm:flex">
        <div className="flex h-[60px] items-center border-b px-6">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <PickleballPaddleIcon className="h-6 w-6 text-primary" />
            <span className="font-headline">LocalDink</span>
          </Link>
        </div>
        <div className="flex-1 overflow-auto py-2">
          <div className="px-4">
            <NavLinks />
          </div>
        </div>
        <div className="mt-auto p-4">
           {currentUser && <UserAvatar player={currentUser} />}
        </div>
      </aside>

      <div className="flex flex-1 flex-col sm:border-l">
        {/* Mobile Header */}
        <header className="sticky top-0 z-10 flex h-[60px] items-center justify-between gap-4 border-b bg-background px-4 sm:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button size="icon" variant="outline" className="sm:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle Menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="sm:max-w-xs">
              <div className="flex h-full flex-col">
                  <div className="flex h-[60px] items-center border-b px-6 -ml-6 -mt-6 mb-4">
                      <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
                          <PickleballPaddleIcon className="h-6 w-6 text-primary" />
                          <span className="font-headline">LocalDink</span>
                      </Link>
                  </div>
                  <NavLinks isMobile />
                  <div className="mt-auto">
                    {currentUser && <UserAvatar player={currentUser} />}
                  </div>
              </div>
            </SheetContent>
          </Sheet>
          <h1 className="flex-1 text-center text-xl font-semibold">{getPageTitle()}</h1>
          {currentUser && <UserAvatar player={currentUser} />}
        </header>

        {/* Desktop Header */}
        <header className="hidden h-[60px] items-center gap-4 border-b bg-background px-6 sm:flex">
           <h1 className="text-xl font-semibold">{getPageTitle()}</h1>
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6">{children}</main>

        {/* Mobile Bottom Nav */}
        <nav className="fixed bottom-0 left-0 right-0 z-10 border-t bg-background p-2 sm:hidden">
          <div className="grid grid-cols-5 items-center justify-items-center gap-1">
            {navItems.map(({ href, icon: Icon, label }) => {
              const isActive = pathname === href;
              return (
                <Link key={href} href={href} className={cn("flex flex-col items-center justify-center rounded-md p-1", isActive ? 'text-primary' : 'text-muted-foreground')}>
                   <Icon className="h-6 w-6" />
                   <span className="text-xs">{label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
        {/* Spacer for mobile bottom nav */}
        <div className="h-20 sm:hidden"></div>
      </div>
    </div>
  );
}
