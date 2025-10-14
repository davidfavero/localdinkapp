'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, signInWithGoogleOnly } from '@/firebase/auth';
import { db } from '@/firebase/db';
import type { Player } from '@/lib/types';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';
import { FirestorePermissionError } from './errors';
import { errorEmitter } from './error-emitter';

// This combines the Firebase User with their Firestore profile
export type AppUser = User & {
  profile: Player | null;
};

type AuthContextValue = {
  user: AppUser | null;
  loading: boolean;
  signInGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Helper to create user document if it doesn't exist.
const ensureUserDocument = async (user: User) => {
  if (!user) return;
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
    const unsub = onAuthStateChanged(auth, async (u) => {
      setLoading(true);
      if (u) {
        await ensureUserDocument(u);
        const userDocRef = doc(db, 'users', u.uid);
        const unsubProfile = onSnapshot(userDocRef, (userDocSnap) => {
            if (userDocSnap.exists()) {
                setProfile({ id: userDocSnap.id, ...userDocSnap.data() } as Player);
            } else {
                setProfile(null);
            }
        }, (error) => {
            console.error("Error listening to profile:", error);
            setProfile(null);
        });
        setUser(u);
        setLoading(false);
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
      loading,
      signInGoogle: async () => { await signInWithGoogleOnly(); },
      signOut: async () => { await firebaseSignOut(auth); },
    };
  }, [user, profile, loading]);

  if (loading) {
    return (
        <div className="flex items-center justify-center min-h-screen">
            <div>Loading...</div>
        </div>
    );
  }

  if (!value.user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="mx-auto max-w-sm space-y-3 text-center">
            <h1 className="text-xl font-semibold">Sign in</h1>
            <button
              className="inline-flex items-center justify-center rounded-md border px-4 py-2"
              onClick={async () => { try { await value.signInGoogle(); } catch (e) { console.error(e); } }}
            >
              Continue with Google
            </button>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={value}>
        <FirebaseErrorListener />
        {children}
    </AuthContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useUser must be used within <FirebaseProvider>');
  return { ...ctx, profile: ctx.user?.profile ?? null, isUserLoading: ctx.loading };
}

// Keeping these for other parts of the app that might use them, but pointing to the new hook
export const useAuth = useUser;
export const useFirestore = () => db;
export const useFirebaseApp = () => auth.app;

// We need to re-export onSnapshot for the profile listener in this file
import { onSnapshot } from 'firebase/firestore';

export { useDoc } from './firestore/use-doc';
export { useCollection } from './firestore/use-collection';
