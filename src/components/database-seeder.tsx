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
    // Flag to prevent multiple runs in React's strict mode
    if (hasSeeded) {
      return;
    }
    setHasSeeded(true);

    const runSeed = async () => {
      const result = await seedDatabaseAction();
      if (result.success) {
        // Only toast if something was actually added
        if (result.usersAdded > 0 || result.courtsAdded > 0) {
            console.log(`Database seeded: ${result.message}`);
            toast({
                title: 'Welcome to LocalDink!',
                description: `We've added some sample players and courts to get you started.`,
            });
        } else {
             console.log('Database already contains data, skipping seed.');
        }
      } else {
        console.error('Database seeding failed:', result.message);
        toast({
          variant: 'destructive',
          title: 'Database Seeding Failed',
          description: result.message,
        });
      }
    };

    runSeed();
  }, [hasSeeded, toast]);

  // This component renders nothing.
  return null;
}
