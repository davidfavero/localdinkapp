import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms and Conditions | LocalDink',
  description: 'Terms governing your use of LocalDink.',
};

const LAST_UPDATED = 'February 27, 2026';

export default function TermsAndConditionsPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold tracking-tight text-foreground font-headline">Terms and Conditions</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

        <div className="mt-8 space-y-6 text-sm leading-7 text-foreground sm:text-base">
          <p>
            These Terms and Conditions ("Terms") govern your access to and use of LocalDink. By using LocalDink,
            you agree to these Terms.
          </p>

          <section>
            <h2 className="text-xl font-semibold">1. Use of the Service</h2>
            <p className="mt-2">
              You agree to use LocalDink only for lawful purposes and in a way that does not violate the rights of
              others or interfere with the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">2. Accounts and Access</h2>
            <p className="mt-2">
              You are responsible for maintaining the security of your account and phone-based login access. You are
              responsible for activity that occurs under your account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">3. SMS and Notifications</h2>
            <p className="mt-2">
              LocalDink may send SMS and in-app notifications related to scheduling and game activity. By providing
              your phone number, you consent to receive transactional messages.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>Program name: <strong>LocalDink Alerts</strong>.</li>
              <li>Message types: invites, reminders, RSVP updates, and session changes.</li>
              <li>Message frequency: varies by account activity.</li>
              <li><strong>Message and data rates may apply.</strong></li>
              <li><strong>Reply HELP for help.</strong></li>
              <li><strong>Reply STOP to cancel.</strong></li>
              <li>Support contact: <a className="underline underline-offset-4" href="mailto:support@localdink.com">support@localdink.com</a>.</li>
            </ul>
            <p className="mt-2">
              Full SMS terms are available at <Link href="/sms-terms" className="underline underline-offset-4">localdink.com/sms-terms</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">4. User Content and Data</h2>
            <p className="mt-2">
              You are responsible for the information you provide (for example, player details and scheduling data).
              You represent that you have permission to share contact details you submit.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">5. Service Availability</h2>
            <p className="mt-2">
              We may modify, suspend, or discontinue part of the service at any time. We do not guarantee uninterrupted
              or error-free operation.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">6. Disclaimer</h2>
            <p className="mt-2">
              LocalDink is provided on an "as is" and "as available" basis without warranties of any kind, to the
              fullest extent permitted by law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">7. Limitation of Liability</h2>
            <p className="mt-2">
              To the fullest extent permitted by law, LocalDink and its operators will not be liable for indirect,
              incidental, special, consequential, or punitive damages arising from your use of the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">8. Indemnification</h2>
            <p className="mt-2">
              You agree to indemnify and hold harmless LocalDink and its operators from claims, liabilities, and
              expenses arising out of your use of the service or violation of these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">9. Changes to These Terms</h2>
            <p className="mt-2">
              We may update these Terms from time to time. Continued use of LocalDink after updates means you accept
              the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">10. Contact</h2>
            <p className="mt-2">
              For questions about these Terms, contact us through the LocalDink support channel.
            </p>
          </section>
        </div>

        <div className="mt-10 border-t pt-6 text-sm text-muted-foreground flex items-center gap-4">
          <Link href="/" className="underline underline-offset-4">
            Back to LocalDink
          </Link>
          <Link href="/privacy-policy" className="underline underline-offset-4">
            View Privacy Policy
          </Link>
          <Link href="/sms-terms" className="underline underline-offset-4">
            View SMS Terms
          </Link>
        </div>
      </div>
    </main>
  );
}
