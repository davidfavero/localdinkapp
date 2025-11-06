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
import type { ChatInput, ChatOutput, Player } from "./types";

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

export async function chatAction(input: ChatInput, currentUser: Player | null): Promise<ChatOutput> {
    const { message, history } = input;

    const adminDb = await getAdminDb();
    if (!adminDb) {
        return { confirmationText: "Sorry, the database is not available. Please try again later." };
    }

    // In a real app, you'd fetch known players for the current user from a database.
    const allUsersSnap = await adminDb.collection('users').get();
    const allPlayers = allUsersSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    } as Player));

    const knownPlayers = allPlayers.map(p => ({
        ...p,
        isCurrentUser: p.id === currentUser?.id,
    }));
    
    try {
        const { chat } = await import("@/ai/flows/chat");
        const response = await chat(knownPlayers, { message, history });
        return response;
    } catch (error) {
        console.error('Error in chatAction:', error);
        return { confirmationText: "Sorry, I encountered an error. Please try again." };
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