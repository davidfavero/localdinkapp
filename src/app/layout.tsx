
// src/app/layout.tsx
import type { Metadata } from 'next';
import { PT_Sans } from 'next/font/google';
import './globals.css';
import { cn } from '@/lib/utils';
import { FirebaseProvider } from '@/firebase/provider';
import { ClientProviders } from '@/components/client-providers';

const ptSans = PT_Sans({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'LocalDink: AI Pickleball Scheduler',
  description: 'An AI-powered scheduler for local pickleball games.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn('font-body antialiased', ptSans.variable)}>
        <FirebaseProvider>
          <ClientProviders>
            {children}
          </ClientProviders>
        </FirebaseProvider>
      </body>
    </html>
  );
}
