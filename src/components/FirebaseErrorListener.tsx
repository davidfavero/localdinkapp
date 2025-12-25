'use client';

import { useState, useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

// Collections where permission errors are non-critical and should not crash the app
const NON_CRITICAL_COLLECTIONS = [
  'notifications', // Notifications are optional - app works without them
];

/**
 * An invisible component that listens for globally emitted 'permission-error' events.
 * It throws any received error to be caught by Next.js's global-error.tsx.
 * 
 * Non-critical collections (like notifications) are logged but don't crash the app.
 */
export function FirebaseErrorListener() {
  // Use the specific error type for the state for type safety.
  const [error, setError] = useState<FirestorePermissionError | null>(null);

  useEffect(() => {
    // The callback now expects a strongly-typed error, matching the event payload.
    const handleError = (error: FirestorePermissionError) => {
      // Check if this error is from a non-critical collection
      const isNonCritical = NON_CRITICAL_COLLECTIONS.some(
        collection => error.path?.includes(collection)
      );
      
      if (isNonCritical) {
        // Just log it, don't crash the app
        console.warn(`Non-critical permission error for ${error.path}:`, error.message);
        return;
      }
      
      // Set error in state to trigger a re-render for critical errors.
      setError(error);
    };

    // The typed emitter will enforce that the callback for 'permission-error'
    // matches the expected payload type (FirestorePermissionError).
    errorEmitter.on('permission-error', handleError);

    // Unsubscribe on unmount to prevent memory leaks.
    return () => {
      errorEmitter.off('permission-error', handleError);
    };
  }, []);

  // On re-render, if an error exists in state, throw it.
  if (error) {
    throw error;
  }

  // This component renders nothing.
  return null;
}
