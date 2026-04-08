import type { Metadata } from 'next';
import Link from 'next/link';
import { RobinIcon } from '@/components/icons/robin-icon';
import { ArrowLeft } from 'lucide-react';
import { getMarkdownContent } from '@/lib/markdown';

export const metadata: Metadata = {
  title: 'Made in Charleston | LocalDink',
  description: 'LocalDink was born out of personal frustration — a hometown idea, made in Charleston, built for pickleball players everywhere.',
};

export default async function MadeInCharlestonPage() {
  const content = await getMarkdownContent('made-in-charleston');

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
            {content?.title ?? 'Made in Charleston'}
          </h1>
        </div>

        {content ? (
          <div
            className="prose prose-base max-w-none text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: content.contentHtml }}
          />
        ) : (
          <p className="text-muted-foreground">Content not available.</p>
        )}
      </div>
    </main>
  );
}
