'use client';

import { useState, useEffect } from 'react';
import {
  Query,
  onSnapshot,
  DocumentData,
  FirestoreError,
  QuerySnapshot,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

/** Utility type to add an 'id' field to a given type T. */
export type WithId<T> = T & { id: string };

/**
 * Interface for the return value of the useCollection hook.
 * @template T Type of the document data.
 */
export interface UseCollectionResult<T> {
  data: WithId<T>[] | null; // Document data with ID, or null.
  isLoading: boolean;       // True if loading.
  error: FirestoreError | Error | null; // Error object, or null.
}

/**
 * React hook to subscribe to a Firestore query in real-time.
 * It now ONLY accepts a Query object, enforcing filtered reads.
 *
 * IMPORTANT! YOU MUST MEMOIZE the inputted query or BAD THINGS WILL HAPPEN.
 * Use useMemoFirebase to memoize it per React guidance. Also, ensure its dependencies are stable.
 *
 * @template T Optional type for document data. Defaults to any.
 * @param {Query<DocumentData> | null | undefined} memoizedQuery -
 * The Firestore Query. The hook waits if the query is null or undefined.
 * @returns {UseCollectionResult<T>} Object with data, isLoading, error.
 */
export function useCollection<T = any>(
    memoizedQuery: Query<DocumentData> | null | undefined,
): UseCollectionResult<T> {
  type ResultItemType = WithId<T>;
  type StateDataType = ResultItemType[] | null;

  const [data, setData] = useState<StateDataType>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<FirestoreError | Error | null>(null);

  useEffect(() => {
    if (!memoizedQuery) {
      setData(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    // DEV guard: block blind collection reads (no filters) to avoid Firestore "list" denials
    const _q: any = memoizedQuery as any;
    const hasFilters = Array.isArray(_q._query?.filters) && _q._query.filters.length > 0;
    if (!hasFilters) {
      const devError = new Error('useCollection requires a filtered Query (add where(...)). Unfiltered collection reads are not allowed.');
      setError(devError);
      setIsLoading(false);
      // We don't emit this one globally as it's a developer error, not a permissions error.
      // We want this to be visible during development.
      console.error(devError);
      return;
    }

    setIsLoading(true);
    setError(null);

    const unsubscribe = onSnapshot(
      memoizedQuery,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const results: ResultItemType[] = snapshot.docs.map(doc => ({ ...(doc.data() as T), id: doc.id }));
        setData(results);
        setError(null);
        setIsLoading(false);
      },
      (error: FirestoreError) => {
        const path = "unknown/path"; // We can't easily get the path from a general query.
        
        const contextualError = new FirestorePermissionError({
          operation: 'list',
          path, // The error from Firestore will contain the actual path.
        });

        setError(contextualError);
        setData(null);
        setIsLoading(false);

        // trigger global error propagation
        errorEmitter.emit('permission-error', contextualError);
      }
    );

    return () => unsubscribe();
  }, [memoizedQuery]); // Re-run if the target query changes.

  return { data, isLoading, error };
}
