'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth } from '@/firebase/auth';
import { db } from '@/firebase/db';
import type { Player } from '@/lib/types';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';
import { FirestorePermissionError } from './errors';
import { errorEmitter } from './error-emitter';
import { useMemoFirebase } from '@/firebase/index';


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
      
      setDoc(userDocRef, payload, { merge: true }).catch((error) => {
          console.error("Failed to create user document:", error);
          const permissionError = new FirestorePermissionError({
            path: userDocRef.path,
            operation: 'create',
            requestResourceData: payload,
          });
          errorEmitter.emit('permission-error', permissionError);
      });
    }
  } catch (error) {
    console.error("Error checking for user document:", error);
    // We can also emit a global error here if needed
  }
};

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setLoading(true);
      if (u) {
        await ensureUserDocument(u);
        const userDocRef = doc(db, 'users', u.uid);
        // Use onSnapshot to listen for profile changes in real-time
        const unsubProfile = onSnapshot(userDocRef, (userDocSnap) => {
            if (userDocSnap.exists()) {
                setProfile({ id: userDocSnap.id, ...userDocSnap.data() } as Player);
            } else {
                // This might happen briefly if the document creation is slow
                setProfile(null);
            }
        }, (error) => {
            console.error("Error listening to profile:", error);
            setProfile(null);
        });
        setUser(u);
        setLoading(false);
        return () => unsubProfile(); // Cleanup profile listener on user change
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });
    return () => unsub(); // Cleanup auth listener on unmount
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const appUser = user ? { ...user, profile } : null;

    return {
      user: appUser,
      loading,
      signInGoogle: async () => { 
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
      },
      signOut: async () => { 
        await signOut(auth);
      },
    };
  }, [user, profile, loading]);

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
export { useDoc } from './firestore/use-doc';
export { useCollection } from './firestore/use-collection';
