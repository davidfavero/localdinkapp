'use client';

import React, { useMemo, type ReactNode } from 'react';
import { FirebaseProvider } from '@/firebase/provider';
import { initializeFirebase } from '@/firebase';

interface FirebaseClientProviderProps {
  children: ReactNode;
}

// This provider is now a wrapper around the main FirebaseProvider
// Its main job is to call initializeFirebase once.
export function FirebaseClientProvider({ children }: FirebaseClientProviderProps) {
  
  // The initializeFirebase function is memoized to run once.
  // In this new structure, it might not be strictly necessary since app, auth, etc., are singletons.
  // However, it doesn't hurt and keeps a consistent pattern.
  useMemo(() => {
    return initializeFirebase();
  }, []);

  return (
    <FirebaseProvider>
      {children}
    </FirebaseProvider>
  );
}
