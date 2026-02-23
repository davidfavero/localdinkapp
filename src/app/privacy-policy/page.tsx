import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy | LocalDink',
  description: 'How LocalDink collects, uses, and protects personal information.',
};

const LAST_UPDATED = 'February 22, 2026';

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold tracking-tight text-foreground font-headline">Privacy Policy</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

        <div className="mt-8 space-y-6 text-sm leading-7 text-foreground sm:text-base">
          <p>
            LocalDink ("we", "us", and "our") respects your privacy. This Privacy Policy explains how we collect,
            use, and protect your information when you use LocalDink.
          </p>

          <section>
            <h2 className="text-xl font-semibold">1. Information We Collect</h2>
            <p className="mt-2">
              We may collect information you provide directly, such as your name, phone number, profile details,
              and player/court information you add in the app. We may also collect technical usage information such
              as device, browser, and interaction logs.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">2. How We Use Information</h2>
            <p className="mt-2">We use information to:</p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>Provide and improve LocalDink features.</li>
              <li>Authenticate your account and keep the service secure.</li>
              <li>Send game invitations, reminders, and related notifications (including SMS, if enabled).</li>
              <li>Troubleshoot issues and monitor service reliability.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">3. SMS Communications</h2>
            <p className="mt-2">
              If you provide a phone number, you agree to receive transactional messages related to your LocalDink
              account and game activity. Message and data rates may apply. Message frequency varies based on your
              activity and notification settings. You can disable SMS notifications in-app.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">4. Sharing of Information</h2>
            <p className="mt-2">
              We do not sell your personal information. We may share information with service providers that help us
              operate the app (for example, hosting, authentication, and messaging providers), or when required by law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">5. Data Retention</h2>
            <p className="mt-2">
              We retain information for as long as needed to provide the service, comply with legal obligations,
              resolve disputes, and enforce agreements.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">6. Security</h2>
            <p className="mt-2">
              We use reasonable technical and organizational measures to protect information. No system is completely
              secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">7. Your Choices</h2>
            <p className="mt-2">
              You can update profile information in the app and adjust notification preferences. You may stop using
              the service at any time.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">8. Children&apos;s Privacy</h2>
            <p className="mt-2">
              LocalDink is not intended for children under 13, and we do not knowingly collect personal information
              from children under 13.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">9. Changes to This Policy</h2>
            <p className="mt-2">
              We may update this Privacy Policy from time to time. We will post the updated version on this page
              and update the "Last updated" date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">10. Contact</h2>
            <p className="mt-2">
              If you have questions about this Privacy Policy, contact us through the LocalDink support channel.
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
        </div>
      </div>
    </main>
  );
}
