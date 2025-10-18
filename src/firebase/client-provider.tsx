
'use client';

import { useUser as useUserHook } from '@/firebase/use-user';
import { useFirebase, UserContext, type UserContextValue } from './provider';
import type { ReactNode } from 'react';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';

export function FirebaseClientProvider({ children }: { children: ReactNode }) {
  const { user } = useFirebase();
  const { profile, isProfileLoading } = useUserHook(user);

  const userContextValue: UserContextValue = {
    user,
    profile,
    isUserLoading: isProfileLoading,
  };

  return (
    <UserContext.Provider value={userContextValue}>
      <FirebaseErrorListener />
      {children}
    </UserContext.Provider>
  );
}
