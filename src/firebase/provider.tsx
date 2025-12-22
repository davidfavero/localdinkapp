
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
import { onAuth, getClientAuth } from './auth';
import { getClientApp } from './app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { Player } from '@/lib/types';
import { useDoc } from './firestore/use-doc';

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
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [firebaseState, setFirebaseState] = useState<{
    app: FirebaseApp | null;
    auth: Auth | null;
    firestore: Firestore | null;
  }>({ app: null, auth: null, firestore: null });

  const { app, auth, firestore } = firebaseState;
  
  useEffect(() => {
    // This console.log is for debugging purposes to verify environment variables.
    console.log('FB cfg ->', {
      apiKey: process.env.NEXT_PUBLIC_FB_API_KEY?.slice(0, 8),
      projectId: process.env.NEXT_PUBLIC_FB_PROJECT_ID,
      appId: process.env.NEXT_PUBLIC_FB_APP_ID?.slice(0, 8),
      authDomain: process.env.NEXT_PUBLIC_FB_AUTH_DOMAIN,
    });
  }, []);

  useEffect(() => {
    // CRITICAL: Only run in browser, never on server
    if (typeof window === 'undefined') {
      return;
    }

    let didCancel = false;
    let unsubscribe: (() => void) | null = null;

    // Delay initialization to ensure we're fully client-side
    const timeoutId = setTimeout(() => {
      try {
        // Check environment variables before attempting initialization
        const requiredEnvVars = {
          apiKey: process.env.NEXT_PUBLIC_FB_API_KEY,
          authDomain: process.env.NEXT_PUBLIC_FB_AUTH_DOMAIN,
          projectId: process.env.NEXT_PUBLIC_FB_PROJECT_ID,
          appId: process.env.NEXT_PUBLIC_FB_APP_ID,
        };

        const missingVars = Object.entries(requiredEnvVars)
          .filter(([_, value]) => !value || value.trim().length < 6 || value.includes('YOUR_'))
          .map(([key]) => `NEXT_PUBLIC_FB_${key.toUpperCase().replace(/([A-Z])/g, '_$1').slice(1)}`);

        if (missingVars.length > 0) {
          throw new Error(
            `Missing or invalid Firebase environment variables: ${missingVars.join(', ')}. ` +
            `Please check your Firebase App Hosting environment configuration.`
          );
        }

        const appInstance = getClientApp();
        const authInstance = getClientAuth();
        const firestoreInstance = getFirestore(appInstance);

        if (didCancel) {
          return;
        }

        setFirebaseState({
          app: appInstance,
          auth: authInstance,
          firestore: firestoreInstance,
        });

        setIsAuthLoading(true);
        unsubscribe = onAuth((nextUser) => {
          if (didCancel) {
            return;
          }
          setUser(nextUser);
          setIsAuthLoading(false);
        }, authInstance);
      } catch (error) {
        console.error('Failed to initialize Firebase client SDK:', error);
        // Log detailed error information for debugging
        if (error instanceof Error) {
          console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            envVars: {
              hasApiKey: !!process.env.NEXT_PUBLIC_FB_API_KEY,
              hasAuthDomain: !!process.env.NEXT_PUBLIC_FB_AUTH_DOMAIN,
              hasProjectId: !!process.env.NEXT_PUBLIC_FB_PROJECT_ID,
              hasAppId: !!process.env.NEXT_PUBLIC_FB_APP_ID,
            },
          });
        }
        if (!didCancel) {
          setFirebaseState({ app: null, auth: null, firestore: null });
          setIsAuthLoading(false);
        }
      }
    }, 0);

    return () => {
      didCancel = true;
      clearTimeout(timeoutId);
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch (error) {
          console.error('Error unsubscribing from Firebase auth state changes:', error);
        }
      }
    };
  }, []);

  // Fetch user profile
  const userDocRef = useMemo(
    () => (firestore && user?.uid ? doc(firestore, 'users', user.uid) : null),
    [firestore, user]
  );

  const {
    data: profile,
    isLoading: isProfileLoading,
    error: profileError,
  } = useDoc<Player>(userDocRef);

  // Create profile if it doesn't exist
  useEffect(() => {
    if (user && !profile && !isProfileLoading && !isCreatingProfile && !profileError) {
      const createProfile = async () => {
        if (!firestore || !userDocRef) return;
        
        setIsCreatingProfile(true);
        try {
          const [firstName, ...lastName] = (user.displayName || 'New User').split(' ');
          const newUserProfile: Omit<Player, 'id'> & { ownerId: string } = {
            firstName,
            lastName: lastName.join(' '),
            email: user.email || '',
            avatarUrl: user.photoURL || '',
            ownerId: user.uid,
          };
          await setDoc(userDocRef, newUserProfile);
        } catch (error) {
          console.error('Error creating user profile:', error);
        } finally {
          setIsCreatingProfile(false);
        }
      };
      createProfile();
    }
  }, [user, profile, isProfileLoading, isCreatingProfile, userDocRef, firestore, profileError]);

  const value: FirebaseContextValue = {
    app,
    auth,
    firestore,
    user,
  };

  const userContextValue: UserContextValue = {
    user,
    profile: profile && user ? { ...profile, id: user.uid } : null,
    // Only include isProfileLoading when we actually have a user (and thus a profile to load)
    // Otherwise useDoc stays in loading state forever waiting for a ref that will never come
    isUserLoading: isAuthLoading || (user ? (isProfileLoading || isCreatingProfile) : false),
  };
  
  console.log('🔥 FirebaseProvider rendering - user:', user?.uid, 'isAuthLoading:', isAuthLoading, 'profile:', !!profile);

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

/**
 * A memoization hook for Firebase queries that ensures queries are only created
 * when Firebase is fully initialized AND the user is authenticated.
 * 
 * This prevents permission errors from occurring when unauthenticated users
 * navigate to protected pages before being redirected to login.
 * 
 * @param factory - Function that creates the query/reference
 * @param deps - Additional dependencies for the memo
 * @param options - Optional configuration (requireAuth defaults to true)
 */
export const useMemoFirebase = <T,>(
  factory: () => T,
  deps: React.DependencyList,
  options?: { requireAuth?: boolean }
): T | null => {
  const { firestore, auth, user } = useFirebase();
  const requireAuth = options?.requireAuth ?? true; // Default to requiring auth
  
  return useMemo(() => {
    // Always require firestore and auth instances
    if (!firestore || !auth) {
      return null;
    }
    
    // If requireAuth is true (default), also require an authenticated user
    if (requireAuth && !user) {
      return null;
    }
    
    const result = factory();
    if (typeof result === 'object' && result !== null) {
      (result as any).__memo = true;
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firestore, auth, user, requireAuth, ...deps]);
};
