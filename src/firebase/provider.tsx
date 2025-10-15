
// src/firebase/provider.tsx
'use client';

import { ReactNode, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { onAuth, signInWithGoogleOnly } from '@/firebase/auth';
import { app } from './app';
import { RobinIcon } from '@/components/icons/robin-icon';

// The configuration check is now primarily handled by the stricter `must` function in `app.ts`.
// This provider will render its children if the app instance is available.
const isFirebaseConfigured = !!app;

export function FirebaseProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      // The error will be thrown by `app.ts` before this component even tries to render.
      // This UI is now a fallback, but the app will likely crash before showing it.
      return;
    }
    const unsub = onAuth(u => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <RobinIcon className="h-16 w-16 text-primary animate-pulse" />
          <p className="text-muted-foreground">Loading LocalDink...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    // Simple Google-only gate
    return (
      <div className="flex flex-col min-h-screen items-center justify-center text-center p-4 bg-background">
        <div className="max-w-sm p-8 border rounded-lg shadow-sm bg-card space-y-4">
          <RobinIcon className="h-12 w-12 text-primary mx-auto" />
          <h1 className="text-2xl font-bold text-foreground font-headline">Welcome to LocalDink</h1>
          <p className="text-sm text-muted-foreground">Sign in with your Google account to continue.</p>
          <button
            className="inline-flex items-center justify-center rounded-md border px-4 py-2 w-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            onClick={async () => {
              try {
                await signInWithGoogleOnly();
              } catch (e) {
                console.error("Google Sign-In Failed:", e);
              }
            }}
          >
            Continue with Google
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

    