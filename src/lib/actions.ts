'use server';

import type {
  ProfilePreferenceExtractionInput,
  ProfilePreferenceExtractionOutput,
} from "@/ai/flows/profile-preference-extraction";
import type {
  HandleCancellationInput,
  HandleCancellationOutput,
} from "@/ai/flows/automated-cancellation-management";
import { getAdminDb } from "@/firebase/admin";
import { players, mockCourts } from "@/lib/data";
import type { ChatInput, ChatOutput, Player, Group } from "./types";

export async function extractPreferencesAction(
  input: ProfilePreferenceExtractionInput
): Promise<ProfilePreferenceExtractionOutput> {
  try {
    const { extractProfilePreferences } = await import("@/ai/flows/profile-preference-extraction");
    return await extractProfilePreferences(input);
  } catch (error) {
    console.error("Error in extractPreferencesAction:", error);
    throw new Error("Failed to extract preferences with AI.");
  }
}

export async function handleCancellationAction(
  input: HandleCancellationInput
): Promise<HandleCancellationOutput> {
  try {
    const { handleCancellation } = await import("@/ai/flows/automated-cancellation-management");
    return await handleCancellation(input);
  } catch (error) {
    console.error("Error in handleCancellationAction:", error);
    throw new Error("Failed to handle cancellation with AI.");
  }
}

export async function chatAction(
    input: ChatInput, 
    currentUser: Player | null,
    knownPlayers?: Player[],
    knownGroups?: (Group & { id: string })[]
): Promise<ChatOutput> {
    const { message, history } = input;

    // Use provided data from client-side
    let players: Player[] = knownPlayers || [];
    let groups: (Group & { id: string })[] = knownGroups || [];

    // Supplement with server-side data
    const adminDb = await getAdminDb();
    if (adminDb && currentUser?.id) {
        try {
            const existingIds = new Set(players.map(p => p.id));
            const existingGroupIds = new Set(groups.map(g => g.id));
            
            // Fetch from users collection (ALL users)
            try {
                const usersSnap = await adminDb.collection('users').get();
                usersSnap.docs.forEach(doc => {
                    if (!existingIds.has(doc.id)) {
                        players.push({ id: doc.id, ...doc.data() } as Player);
                        existingIds.add(doc.id);
                    }
                });
            } catch (e) {
                console.warn('Could not fetch users:', e);
            }

            // Fetch ALL players from players collection
            try {
                const playersSnap = await adminDb.collection('players').get();
                playersSnap.docs.forEach(doc => {
                    if (!existingIds.has(doc.id)) {
                        const data = doc.data();
                        players.push({ id: doc.id, ...data } as Player);
                        existingIds.add(doc.id);
                    }
                });
            } catch (e) {
                console.warn('Could not fetch players:', e);
            }

            // Fetch ALL groups
            try {
                const groupsSnap = await adminDb.collection('groups').get();
                groupsSnap.docs.forEach(doc => {
                    if (!existingGroupIds.has(doc.id)) {
                        const data = doc.data();
                        groups.push({ id: doc.id, ...data } as Group & { id: string });
                        existingGroupIds.add(doc.id);
                    }
                });
            } catch (e) {
                console.warn('Could not fetch groups:', e);
            }

            console.log(`[chatAction] Loaded ${players.length} players, ${groups.length} groups`);
        } catch (error) {
            console.error('Error fetching data from Admin DB:', error);
        }
    }

    // If still no players, use just the current user
    if (players.length === 0 && currentUser) {
        players = [{ ...currentUser, isCurrentUser: true }];
    }

    // Mark current user
    const knownPlayersWithCurrent = players.map(p => ({
        ...p,
        isCurrentUser: p.id === currentUser?.id,
    }));
    
    // Log for debugging
    console.log('[chatAction] Known players:', knownPlayersWithCurrent.map(p => `${p.firstName} ${p.lastName}`));
    console.log('[chatAction] Known groups:', groups.map(g => g.name));
    
    try {
        const { chat } = await import("@/ai/flows/chat");
        const response = await chat(knownPlayersWithCurrent, { message, history }, groups);
        return response;
    } catch (error: any) {
        console.error('Error in chatAction:', error);
        const errorMessage = error?.message || 'Unknown error';
        console.error('Chat error details:', { errorMessage, stack: error?.stack });
        return { 
            confirmationText: `Sorry, I encountered an error: ${errorMessage}. Please try again or rephrase your request.` 
        };
    }
}

export async function seedDatabaseAction(): Promise<{ success: boolean, message: string, usersAdded: number, courtsAdded: number }> {
    try {
        const adminDb = await getAdminDb();
        if (!adminDb) {
            return { success: false, message: 'Database not available', usersAdded: 0, courtsAdded: 0 };
        }

        let usersAdded = 0;
        let courtsAdded = 0;

        // Check if users collection is empty
        const usersSnap = await adminDb.collection('users').limit(1).get();
        if (usersSnap.empty) {
            const batch = adminDb.batch();
            players.forEach(player => {
                // Use a specific ID if you want to be able to log in with a known user
                const docRef = adminDb.collection('users').doc(player.id);
                const playerData = { ...player };
                // Don't save the id within the document itself
                delete (playerData as Partial<Player>).id;
                batch.set(docRef, playerData);
            });
            await batch.commit();
            usersAdded = players.length;
        }

        // Check if courts collection is empty
        const courtsSnap = await adminDb.collection('courts').limit(1).get();
        if (courtsSnap.empty) {
            const batch = adminDb.batch();
            mockCourts.forEach(court => {
                const docRef = adminDb.collection('courts').doc();
                batch.set(docRef, court);
            });
            await batch.commit();
            courtsAdded = mockCourts.length;
        }
        
        if (usersAdded > 0 || courtsAdded > 0) {
            return { success: true, message: 'Database seeded successfully.', usersAdded, courtsAdded };
        } else {
            return { success: true, message: 'Database already contains data, no seeding needed.', usersAdded: 0, courtsAdded: 0 };
        }

    } catch (error: any) {
        console.error('Error seeding database:', error);
        return { success: false, message: error.message, usersAdded: 0, courtsAdded: 0 };
    }
}