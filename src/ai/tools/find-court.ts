'use server';

/**
 * @fileOverview A tool for finding courts by name.
 * Updated: 2024-12-10 - Improved matching for apostrophes (I'On vs ION)
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { getAdminDb } from '@/firebase/admin';

const FindCourtSchema = z.object({
  courtName: z.string().describe('The name of the court to find (e.g., "I\'On Courts", "Sunnyvale Park").'),
  userId: z.string().optional().describe('Optional user ID to search only their courts. If not provided, searches all courts.'),
});

export const findCourtTool = ai.defineTool(
  {
    name: 'findCourtTool',
    description: 'Finds a court by name. Use this when the user mentions a court name to get the court ID needed for creating a game session.',
    inputSchema: FindCourtSchema,
    outputSchema: z.object({
      courtId: z.string().optional(),
      courtName: z.string().optional(),
      location: z.string().optional(),
      found: z.boolean(),
      error: z.string().optional(),
    }),
  },
  async ({ courtName, userId }) => {
    try {
      const adminDb = await getAdminDb();
      if (!adminDb) {
        return {
          found: false,
          error: 'Database not available',
        };
      }

      // Helper to create a "clean" version for matching - removes apostrophes, special chars, and common suffixes
      const cleanForMatching = (str: string) => {
        return str
          .toLowerCase()
          .trim()
          .replace(/['''`]/g, '')  // Remove all apostrophe variations
          .replace(/\s+/g, ' ')    // Normalize spaces
          .replace(/\s*(courts?|tennis|center|park|club)$/i, '') // Remove suffixes
          .trim();
      };

      const normalizedSearchName = courtName.toLowerCase().trim().replace(/\s+/g, ' ');
      const cleanedSearch = cleanForMatching(courtName);

      console.log(`[findCourt] Searching for: "${courtName}" (normalized: "${normalizedSearchName}", cleaned: "${cleanedSearch}")`);

      // First try: search courts owned by the user
      let snapshot;
      if (userId) {
        snapshot = await adminDb.collection('courts').where('ownerId', '==', userId).get();
        console.log(`[findCourt] Found ${snapshot.docs.length} courts owned by user`);
      }
      
      // If no courts found for user, search ALL courts
      if (!snapshot || snapshot.empty) {
        snapshot = await adminDb.collection('courts').get();
        console.log(`[findCourt] Searching all ${snapshot.docs.length} courts`);
      }

      // Log all available courts for debugging
      console.log('[findCourt] Available courts:', snapshot.docs.map(d => d.data().name));
      
      // Try exact match first (case insensitive)
      let matchedCourt = snapshot.docs.find(doc => {
        const data = doc.data();
        const name = (data.name || '').toLowerCase().trim();
        return name === normalizedSearchName;
      });

      // Try cleaned match (removes apostrophes and suffixes: "I'On Courts" matches "ION")
      if (!matchedCourt) {
        matchedCourt = snapshot.docs.find(doc => {
          const data = doc.data();
          const cleanedName = cleanForMatching(data.name || '');
          return cleanedName === cleanedSearch;
        });
      }

      // If no exact match, try partial/contains match
      if (!matchedCourt) {
        matchedCourt = snapshot.docs.find(doc => {
          const data = doc.data();
          const name = (data.name || '').toLowerCase().trim();
          const cleanedName = cleanForMatching(data.name || '');
          return name.includes(normalizedSearchName) || 
                 normalizedSearchName.includes(name) ||
                 cleanedName.includes(cleanedSearch) ||
                 cleanedSearch.includes(cleanedName);
        });
      }

      // Try starts-with match
      if (!matchedCourt) {
        matchedCourt = snapshot.docs.find(doc => {
          const data = doc.data();
          const cleanedName = cleanForMatching(data.name || '');
          return cleanedName.startsWith(cleanedSearch) || cleanedSearch.startsWith(cleanedName);
        });
      }

      if (matchedCourt) {
        const data = matchedCourt.data();
        console.log(`[findCourt] Found court: "${data.name}" (id: ${matchedCourt.id})`);
        return {
          found: true,
          courtId: matchedCourt.id,
          courtName: data.name,
          location: data.location,
        };
      }

      console.log(`[findCourt] No court found matching "${courtName}"`);
      return {
        found: false,
        error: `Court "${courtName}" not found. The user may need to add it to their courts first.`,
      };
    } catch (error: any) {
      console.error('Failed to find court:', error);
      return {
        found: false,
        error: error.message || 'Failed to search for court',
      };
    }
  }
);

