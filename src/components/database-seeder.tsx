'use client';

import { seedDatabaseAction } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { useEffect, useState } from 'react';
import { useUser } from '@/firebase';

/**
 * An invisible component that runs only once on application startup
 * to ensure the database is seeded with initial data.
 */
export function DatabaseSeeder() {
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();
  const [hasSeeded, setHasSeeded] = useState(false);

  useEffect(() => {
    // Flag to prevent multiple runs in React's strict mode
    let hasRun = false;
    // Ensure this effect runs only once.
    if (hasSeeded || hasRun || isUserLoading || !user) {
      return;
    }
    hasRun = true;

    const runSeed = async () => {
      try {
        console.log('Attempting to seed database...');
        // Pass the authenticated user to the action
        const result = await seedDatabaseAction();
        
        // We only want to show a toast if data was actually added.
        if (result.success && (result.usersAdded > 0 || result.courtsAdded > 0)) {
          toast({
            title: 'Welcome to LocalDink!',
            description: `We've added some sample players and courts to get you started.`,
          });
          console.log(`Database seeded: ${result.message}`);
        } else if (!result.success) {
            console.error('Database seeding failed:', result.message);
             toast({
              variant: 'destructive',
              title: 'Database Seeding Failed',
              description: result.message || 'Could not add initial data to the app.',
            });
        } else {
            console.log('Database already contains data, skipping seed.');
        }
      } catch (error: any) {
        console.error('Failed to seed database:', error);
        toast({
          variant: 'destructive',
          title: 'Database Seeding Failed',
          description: error.message || 'Could not add initial data to the app. Some features may not work.',
        });
      } finally {
        setHasSeeded(true);
      }
    };

    runSeed();
  }, [user, isUserLoading, hasSeeded, toast]);

  // This component renders nothing.
  return null;
}
