
'use client';

import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { useDoc } from './firestore/use-doc';
import { useFirebase } from './provider';
import type { Player } from '@/lib/types';
import { useMemoFirebase } from './provider';

/**
 * Returns current Firebase user's app-specific profile, and loading states.
 * Creates a user profile document in Firestore on first sign-in.
 */
export function useUser(user: User | null) {
  const { firestore } = useFirebase();
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);

  const userDocRef = useMemoFirebase(
    () => (firestore && user?.uid ? doc(firestore, 'users', user.uid) : null),
    [firestore, user]
  );

  const {
    data: profile,
    isLoading: isProfileLoading,
    error: profileError,
  } = useDoc<Player>(userDocRef);

  useEffect(() => {
    if (user && !profile && !isProfileLoading && !isCreatingProfile && !profileError) {
      const createProfile = async () => {
        if (!firestore || !userDocRef) return;
        
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
        } finally {
          setIsCreatingProfile(false);
        }
      };
      createProfile();
    }
  }, [user, profile, isProfileLoading, isCreatingProfile, userDocRef, firestore, profileError]);

  return {
    profile: profile ? { ...profile, id: user!.uid } : null,
    isProfileLoading: isProfileLoading || isCreatingProfile,
    profileError
  };
}
