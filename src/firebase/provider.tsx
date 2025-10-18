
'use client';

import {
  createContext,
  useContext,
  ReactNode,
  useEffect,
  useState,
  useMemo,
} from 'react';
import type { User } from 'firebase/auth';
import { onAuth } from './auth';
import { getClientApp } from './app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { Player } from '@/lib/types';

interface FirebaseContextValue {
  app: FirebaseApp | null;
  auth: Auth | null;
  firestore: Firestore | null;
  user: User | null;
}

export interface UserContextValue {
  user: User | null;
  profile: (Player & { id: string }) | null;
  isUserLoading: boolean;
}

const FirebaseContext = createContext<FirebaseContextValue | undefined>(
  undefined
);
export const UserContext = createContext<UserContextValue | undefined>(undefined);

export function FirebaseProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const app = useMemo(getClientApp, []);
  const auth = useMemo(() => getAuth(app), [app]);
  const firestore = useMemo(() => getFirestore(app), [app]);
  
  useEffect(() => {
    // This console.log is for debugging purposes to verify environment variables.
    console.log('FB cfg ->', {
      apiKey: process.env.NEXT_PUBLIC_FB_API_KEY?.slice(0, 8),
      projectId: process.env.NEXT_PUBLIC_FB_PROJECT_ID,
      appId: process.env.NEXT_PUBLIC_FB_APP_ID?.slice(0, 8),
    });
  }, []);

  useEffect(() => {
    const unsubscribe = onAuth((user) => {
      setUser(user);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, [auth]);

  const value: FirebaseContextValue = {
    app,
    auth,
    firestore,
    user,
  };

  const userContextValue: UserContextValue = {
    user,
    profile: null,
    isUserLoading: isAuthLoading,
  };

  return (
    <FirebaseContext.Provider value={value}>
      <UserContext.Provider value={userContextValue}>
        {children}
      </UserContext.Provider>
    </FirebaseContext.Provider>
  );
}

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
};

export const useAuth = () => {
  const { user, auth } = useFirebase();
  const { isUserLoading } = useUser();
  return { user, auth, isUserLoading };
}

export const useUser = () => {
    const context = useContext(UserContext);
    if (context === undefined) {
        throw new Error('useUser must be used within a FirebaseProvider/ClientProvider setup');
    }
    return context;
}

export const useFirestore = () => {
    const { firestore } = useFirebase();
    return firestore;
}

export const useFirebaseApp = () => {
    const { app } = useFirebase();
    return app;
}

export const useMemoFirebase = <T>(
  factory: () => T,
  deps: React.DependencyList
): T | null => {
  const { firestore, auth } = useFirebase();
  return useMemo(() => {
    if (!firestore || !auth) {
      return null;
    }
    const result = factory();
    if (typeof result === 'object' && result !== null) {
      (result as any).__memo = true;
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firestore, auth, ...deps]);
};
