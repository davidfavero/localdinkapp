import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { RobinIcon } from '@/components/icons/robin-icon';
import { ArrowRight } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RobinIcon className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground font-headline">
            LocalDink
          </h1>
        </div>
        <Button asChild variant="ghost">
          <Link href="/dashboard">Enter App</Link>
        </Button>
      </header>

      <main className="flex-grow flex items-center">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="flex flex-col items-start text-left">
              <div className="mb-4 flex items-center gap-3 rounded-full bg-accent/20 px-4 py-1">
                <RobinIcon className="h-6 w-6 text-primary" />
                <p className="font-semibold text-primary">Meet Robin, your AI scheduler</p>
              </div>
              <h2 className="text-4xl md:text-6xl font-extrabold tracking-tighter mb-4 font-headline bg-gradient-to-r from-primary to-green-700 bg-clip-text text-transparent">
                Never miss a game.
              </h2>
              <p className="text-lg md:text-xl text-muted-foreground max-w-lg mb-8">
                LocalDink uses AI to effortlessly schedule your pickleball matches, manage RSVPs, and find substitutes, so you can focus on playing.
              </p>
              <Button asChild size="lg" className="bg-gradient-to-r from-primary to-green-700 text-primary-foreground hover:opacity-90 transition-opacity shadow-lg">
                <Link href="/dashboard">
                  Schedule Your First Game <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>
            <div className="hidden md:flex justify-center items-center relative">
               <div className="absolute inset-0 bg-accent/20 rounded-full blur-3xl"></div>
                <div className="relative">
                    <RobinIcon className="h-64 w-64 text-primary opacity-10" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                        <div className="w-80 h-80 rounded-full bg-gradient-to-br from-primary via-accent to-green-700 animate-spin-slow" style={{ animationDuration: '10s' }} />
                    </div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 backdrop-blur-sm p-8 rounded-full">
                        <RobinIcon className="w-48 h-48 text-background drop-shadow-2xl" />
                    </div>
                </div>
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
