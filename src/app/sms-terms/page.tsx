import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'SMS Terms | LocalDink',
  description: 'LocalDink SMS opt-in, help, and stop policy.',
};

const LAST_UPDATED = 'February 27, 2026';

export default function SmsTermsPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold tracking-tight text-foreground font-headline">LocalDink SMS Terms</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

        <div className="mt-8 space-y-6 text-sm leading-7 text-foreground sm:text-base">
          <section>
            <h2 className="text-xl font-semibold">1. Program Name</h2>
            <p className="mt-2">
              This messaging program is called <strong>LocalDink Alerts</strong>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">2. What Messages You Receive</h2>
            <p className="mt-2">
              Messages are transactional and service-related, including game invites, RSVP updates, reminders, and
              session changes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">3. Message Frequency</h2>
            <p className="mt-2">
              Message frequency varies based on your game activity and notification settings.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">4. Opt-In Flow (Web-Visible Verification)</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-6">
              <li>User enters phone number during LocalDink account setup.</li>
              <li>User verifies phone ownership with a one-time SMS code.</li>
              <li>User enables SMS notifications in app settings.</li>
            </ol>
            <p className="mt-2">
              Users can disable SMS notifications at any time in LocalDink settings.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">5. Carrier Notice</h2>
            <p className="mt-2">
              <strong>Message and data rates may apply.</strong>
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">6. Help and Opt-Out</h2>
            <p className="mt-2">
              <strong>Reply HELP for help.</strong> <strong>Reply STOP to cancel.</strong>
            </p>
            <p className="mt-2">
              You may also contact support at <a className="underline underline-offset-4" href="mailto:support@localdink.com">support@localdink.com</a>.
            </p>
          </section>
        </div>

        <div className="mt-10 border-t pt-6 text-sm text-muted-foreground flex items-center gap-4">
          <Link href="/" className="underline underline-offset-4">
            Back to LocalDink
          </Link>
          <Link href="/terms-and-conditions" className="underline underline-offset-4">
            View Terms and Conditions
          </Link>
          <Link href="/privacy-policy" className="underline underline-offset-4">
            View Privacy Policy
          </Link>
        </div>
      </div>
    </main>
  );
}
