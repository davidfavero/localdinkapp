'use client';

import { seedDatabaseAction } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { useEffect, useState } from 'react';

/**
 * An invisible component that runs only once on application startup
 * to ensure the database is seeded with initial data.
 */
export function DatabaseSeeder() {
  const { toast } = useToast();
  const [hasSeeded, setHasSeeded] = useState(false);

  useEffect(() => {
    // Ensure this effect runs only once.
    if (hasSeeded) {
      return;
    }

    const runSeed = async () => {
      try {
        console.log('Attempting to seed database...');
        const result = await seedDatabaseAction();
        // We only want to show a toast if data was actually added.
        // The action returns the number of users/courts added.
        if (result.success && (result.usersAdded > 0 || result.courtsAdded > 0)) {
          toast({
            title: 'Welcome to LocalDink!',
            description: `We've added some sample players and courts to get you started.`,
          });
          console.log(`Database seeded: ${result.message}`);
        } else {
            console.log('Database already contains data, skipping seed.');
        }
      } catch (error: any) {
        console.error('Failed to seed database:', error);
        toast({
          variant: 'destructive',
          title: 'Database Seeding Failed',
          description: 'Could not add initial data to the app. Some features may not work.',
        });
      } finally {
        setHasSeeded(true);
      }
    };

    runSeed();
  }, [hasSeeded, toast]);

  // This component renders nothing.
  return null;
}
