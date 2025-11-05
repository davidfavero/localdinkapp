
'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';

// Dynamically import components that should only be rendered on the client side.
const Toaster = dynamic(() => import('@/components/ui/toaster').then(m => m.Toaster), {
  ssr: false,
});

const DatabaseSeeder = dynamic(
  () => import('@/components/database-seeder').then(m => m.DatabaseSeeder),
  { ssr: false }
);

/**
 * A client component wrapper to include providers/components that are not compatible
 * with Server-Side Rendering (SSR).
 */
export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <>
      <FirebaseErrorListener />
      <DatabaseSeeder />
      {children}
      <Toaster />
    </>
  );
}
