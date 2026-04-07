import type { Metadata } from 'next';
import Link from 'next/link';
import { RobinIcon } from '@/components/icons/robin-icon';
import { ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Made in Charleston | LocalDink',
  description: 'LocalDink was born out of personal frustration — a hometown idea, made in Charleston, built for pickleball players everywhere.',
};

export default function MadeInCharlestonPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <RobinIcon className="h-10 w-10 text-primary" />
          <h1 className="text-4xl font-bold tracking-tight text-foreground font-headline">
            Made in Charleston
          </h1>
        </div>

        <div className="space-y-6 text-base leading-8 text-muted-foreground">
          <p className="text-lg text-foreground font-medium">
            LocalDink was born out of personal frustration.
          </p>

          <p>
            I kept running into the same problem in Charleston, in Atlanta, and at Lake Oconee:
            pickleball games were being organized through group texts, WhatsApp chains, and a
            patchwork of tools that were never designed for this. Too many messages. Too much
            confusion. Too much effort just to get four people on a court at the same time.
          </p>

          <p>
            Pickleball has exploded, but the way most of us still schedule games feels outdated
            and messy.
          </p>

          <p>
            So I started building what I wished existed — something designed around the way people
            actually play. A better way to organize groups, coordinate games, and cut through the
            noise. Something simple, social, and built specifically for pickleball.
          </p>

          <p>
            LocalDink is a hometown idea, made in Charleston, but it comes from a problem that
            players everywhere recognize immediately.
          </p>

          <p className="text-lg text-foreground font-semibold italic">
            The game is fun. Scheduling it should be too.
          </p>
        </div>
      </div>
    </main>
  );
}
