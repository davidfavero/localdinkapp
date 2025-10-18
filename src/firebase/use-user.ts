'use client';

import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { useDoc } from './firestore/use-doc';
import { useAuth } from './provider';
import { db } from './db';
import type { Player } from '@/lib/types';
import { useMemoFirebase } from './provider';

/**
 * Returns current Firebase user, their app-specific profile, and loading states.
 * Creates a user profile document in Firestore on first sign-in.
 */
export function useUser() {
  const { user, isUserLoading } = useAuth();
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);

  // Create a memoized reference to the user's profile document
  const userDocRef = useMemoFirebase(
    () => (db && user?.uid ? doc(db, 'users', user.uid) : null),
    [db, user]
  );

  const {
    data: profile,
    isLoading: isProfileLoading,
    error: profileError,
  } = useDoc<Player>(userDocRef);

  useEffect(() => {
    if (user && !profile && !isProfileLoading && !isCreatingProfile && !profileError) {
      // If the user is authenticated but has no profile, create one.
      const createProfile = async () => {
        if (!db || !userDocRef) return;
        
        setIsCreatingProfile(true);
        try {
          const [firstName, ...lastName] = (user.displayName || 'New User').split(' ');
          const newUserProfile: Omit<Player, 'id'> = {
            firstName,
            lastName: lastName.join(' '),
            email: user.email || '',
            avatarUrl: user.photoURL || '',
          };
          await setDoc(userDocRef, newUserProfile);
        } catch (error) {
          console.error('Error creating user profile:', error);
          // You might want to show a toast to the user here
        } finally {
          setIsCreatingProfile(false);
        }
      };
      createProfile();
    }
  }, [user, profile, isProfileLoading, isCreatingProfile, userDocRef, profileError]);

  return {
    user,
    profile: profile ? { ...profile, id: user!.uid } : null,
    isUserLoading: isUserLoading || isProfileLoading || isCreatingProfile,
    profileError
  };
}
