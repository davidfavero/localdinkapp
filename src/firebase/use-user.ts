
'use client';

import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { useDoc } from './firestore/use-doc';
import { useFirebase } from './provider';
import type { Player } from '@/lib/types';
import { useMemoFirebase } from './provider';
import { linkPlayerContactsAction } from '@/lib/actions';

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

  // Track whether we've already run linking for this session
  const [hasLinked, setHasLinked] = useState(false);

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
            // Include phone number if user signed in with phone auth
            ...(user.phoneNumber && { phone: user.phoneNumber }),
          };
          await setDoc(userDocRef, newUserProfile);
          // Link any existing player contacts that match this user's phone/email
          linkPlayerContactsAction(user.uid, user.phoneNumber, user.email).catch(console.error);
          setHasLinked(true);
        } catch (error) {
          console.error('Error creating user profile:', error);
        } finally {
          setIsCreatingProfile(false);
        }
      };
      createProfile();
    }
  }, [user, profile, isProfileLoading, isCreatingProfile, userDocRef, firestore, profileError]);

  // For existing users who already have a profile, run linking once per session
  // This catches cases where a contact was added before the user signed up
  useEffect(() => {
    if (user && profile && !hasLinked) {
      setHasLinked(true);
      linkPlayerContactsAction(user.uid, user.phoneNumber, user.email).catch(console.error);
    }
  }, [user, profile, hasLinked]);

  return {
    profile: profile ? { ...profile, id: user!.uid } : null,
    isProfileLoading: isProfileLoading || isCreatingProfile,
    profileError
  };
}
