'use client';

import { getFirestore, type Firestore } from 'firebase/firestore';
import { getClientApp } from './app';

let firestoreInstance: Firestore | null = null;

function assertClientEnvironment() {
  if (typeof window === 'undefined') {
    throw new Error(
      'getClientDb() cannot be called on the server. Use it from client components or effects only.'
    );
  }
}

export function getClientDb(): Firestore {
  assertClientEnvironment();

  if (firestoreInstance) {
    return firestoreInstance;
  }

  const app = getClientApp();
  firestoreInstance = getFirestore(app);
  return firestoreInstance;
}
