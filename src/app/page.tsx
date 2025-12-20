'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { RobinIcon } from '@/components/icons/robin-icon';
import { ArrowRight } from 'lucide-react';

// Separate component that uses useSearchParams
function LandingRedirectHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  useEffect(() => {
    const skipLanding = searchParams.get('app') === 'true' || 
                       process.env.NEXT_PUBLIC_SKIP_LANDING === 'true';
    
    if (skipLanding) {
      router.replace('/login');
    }
  }, [searchParams, router]);
  
  return null;
}

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Wrap the redirect handler in Suspense for Next.js 15 compatibility */}
      <Suspense fallback={null}>
        <LandingRedirectHandler />
      </Suspense>
      <header className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RobinIcon className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground font-headline">
            LocalDink
          </h1>
        </div>
        <Button asChild variant="ghost">
          <Link href="/login">Enter App</Link>
        </Button>
      </header>

      <main className="flex-grow flex items-center">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="flex justify-center items-center relative order-1 md:order-2">
               <div className="absolute inset-0 bg-accent/20 rounded-full blur-3xl"></div>
                <div className="relative">
                    <RobinIcon className="h-32 w-32 md:h-48 md:w-48 lg:h-64 lg:w-64 text-primary opacity-10" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                        <div className="w-40 h-40 md:w-60 md:h-60 lg:w-80 lg:h-80 rounded-full bg-gradient-to-br from-primary via-accent to-green-700 animate-spin-slow" style={{ animationDuration: '10s' }} />
                    </div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 backdrop-blur-sm p-4 md:p-6 lg:p-8 rounded-full">
                        <RobinIcon className="w-24 h-24 md:w-36 md:h-36 lg:w-48 lg:h-48 text-background drop-shadow-2xl" />
                    </div>
                </div>
            </div>
            <div className="flex flex-col items-start text-left order-2 md:order-1">
              <div className="mb-4 flex items-center gap-3 rounded-full bg-accent/20 px-4 py-1">
                <RobinIcon className="h-6 w-6 text-primary" />
                <p className="font-semibold text-primary">Meet Robin, your AI scheduler</p>
              </div>
              <h2 className="text-4xl md:text-6xl font-extrabold tracking-tighter mb-4 font-headline bg-gradient-to-r from-primary to-green-700 bg-clip-text text-transparent leading-normal pb-2">
                Never miss a game.
              </h2>
              <p className="text-lg md:text-xl text-muted-foreground max-w-lg mb-8">
                LocalDink uses AI to effortlessly schedule your pickleball matches, manage RSVPs, and find substitutes, so you can focus on playing.
              </p>
              <Button asChild size="lg" className="bg-gradient-to-r from-primary to-green-700 text-primary-foreground hover:opacity-90 transition-opacity shadow-lg">
                <Link href="/login">
                  Schedule Your First Game <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </main>

      <footer className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} LocalDink. Game on.</p>
      </footer>
    </div>
  );
}
