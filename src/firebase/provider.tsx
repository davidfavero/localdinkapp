'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, signInWithGoogleOnly } from '@/firebase/auth';
import { db } from '@/firebase/db';
import type { Player } from '@/lib/types';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';
import { FirestorePermissionError } from './errors';
import { errorEmitter } from './error-emitter';
import { RobinIcon } from '@/components/icons/robin-icon';

// This combines the Firebase User with their Firestore profile
export type AppUser = User & {
  profile: Player | null;
};

type AuthContextValue = {
  user: AppUser | null;
  profile: Player | null;
  isUserLoading: boolean;
  signInGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// Helper to create user document if it doesn't exist.
const ensureUserDocument = async (user: User) => {
  if (!user || !db) return;
  const userDocRef = doc(db, 'users', user.uid);
  try {
    const docSnap = await getDoc(userDocRef);

    if (!docSnap.exists()) {
      const [firstName, ...lastNameParts] = (user.displayName || 'New User').split(' ');
      const lastName = lastNameParts.join(' ');
      const payload: Omit<Player, 'id'> = {
          firstName: firstName || 'New',
          lastName: lastName || 'User',
          email: user.email ?? '',
          phone: user.phoneNumber ?? '',
          avatarUrl: user.photoURL ?? '',
      };
      
      setDoc(userDocRef, payload, { merge: true }).catch(err => {
        const permissionError = new FirestorePermissionError({
          path: userDocRef.path,
          operation: 'create',
          requestResourceData: payload,
        });
        errorEmitter.emit('permission-error', permissionError);
      });

    }
  } catch (error) {
    console.error("Error ensuring user document:", error);
    // This is a good place to emit a specific error if needed
    const permissionError = new FirestorePermissionError({
        path: userDocRef.path,
        operation: 'get', // or 'create' depending on where it failed
    });
    errorEmitter.emit('permission-error', permissionError);
  }
};

export function FirebaseProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Temporary log to debug environment variables
    console.log('FB cfg ->', {
      apiKey: process.env.NEXT_PUBLIC_FB_API_KEY?.slice(0,8),
      projectId: process.env.NEXT_PUBLIC_FB_PROJECT_ID,
      appId: process.env.NEXT_PUBLIC_FB_APP_ID?.slice(0,8),
    });

    // Because app.ts now throws, if we get here, auth and db will be initialized.
    const unsub = onAuthStateChanged(auth, async (u) => {
      setLoading(true);
      if (u) {
        await ensureUserDocument(u);
        const userDocRef = doc(db!, 'users', u.uid);
        const unsubProfile = onSnapshot(userDocRef, (userDocSnap) => {
            if (userDocSnap.exists()) {
                setProfile({ id: userDocSnap.id, ...userDocSnap.data() } as Player);
            } else {
                setProfile(null);
            }
            setUser(u); // Set user after profile is potentially loaded
            setLoading(false);
        }, (error) => {
            console.error("Error listening to profile:", error);
            setProfile(null);
            setUser(u); // Still set the user
            setLoading(false);
        });
        return () => unsubProfile(); 
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const appUser = user ? { ...user, profile } : null;

    return {
      user: appUser,
      profile: profile,
      isUserLoading: loading,
      signInGoogle: async () => { await signInWithGoogleOnly(); },
      signOut: async () => { auth && await firebaseSignOut(auth); },
    };
  }, [user, profile, loading]);
  
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

  // Children are login page or dashboard, they will handle the user state
  return (
    <AuthContext.Provider value={value}>
        <FirebaseErrorListener />
        {children}
    </AuthContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useUser must be used within a FirebaseProvider');
  }
  return ctx;
}

// Keeping these for other parts of the app that might use them
export const useAuth = useUser;
export const useFirestore = () => db;
export const useFirebaseApp = () => auth?.app;
