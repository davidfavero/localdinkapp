import type { Metadata } from 'next';
import Link from 'next/link';
import { getMarkdownContent } from '@/lib/markdown';

export const metadata: Metadata = {
  title: 'Privacy Policy | LocalDink',
  description: 'How LocalDink collects, uses, and protects personal information.',
};

export default async function PrivacyPolicyPage() {
  const content = await getMarkdownContent('privacy-policy');

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold tracking-tight text-foreground font-headline">
          {content?.title ?? 'Privacy Policy'}
        </h1>
        {content?.lastUpdated && (
          <p className="mt-3 text-sm text-muted-foreground">Last updated: {content.lastUpdated}</p>
        )}

        {content ? (
          <div
            className="mt-8 prose prose-sm sm:prose-base max-w-none"
            dangerouslySetInnerHTML={{ __html: content.contentHtml }}
          />
        ) : (
          <p className="mt-8 text-muted-foreground">Content not available.</p>
        )}

        <div className="mt-10 border-t pt-6 text-sm text-muted-foreground flex items-center gap-4">
          <Link href="/" className="underline underline-offset-4">Back to LocalDink</Link>
          <Link href="/terms-and-conditions" className="underline underline-offset-4">View Terms and Conditions</Link>
          <Link href="/sms-terms" className="underline underline-offset-4">View SMS Terms</Link>
        </div>
      </div>
    </main>
  );
}
