'use server';

import { extractProfilePreferences, ProfilePreferenceExtractionInput, ProfilePreferenceExtractionOutput } from "@/ai/flows/profile-preference-extraction";
import { handleCancellation, HandleCancellationInput, HandleCancellationOutput } from "@/ai/flows/automated-cancellation-management";
import { chat } from "@/ai/flows/chat";
import type { ChatInput, ChatOutput } from "@/lib/types";
import { players as mockPlayers, courts as mockCourts } from '@/lib/data';
import { collection, writeBatch, getDocs, query, where, getFirestore } from 'firebase/firestore';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { firebaseConfig } from "@/firebase/config";


export async function extractPreferencesAction(
  input: ProfilePreferenceExtractionInput
): Promise<ProfilePreferenceExtractionOutput> {
  try {
    const result = await extractProfilePreferences(input);
    return result;
  } catch (error) {
    console.error("Error in extractPreferencesAction:", error);
    // In a real app, you'd want more robust error handling
    throw new Error("Failed to extract preferences with AI.");
  }
}

export async function handleCancellationAction(
  input: HandleCancellationInput
): Promise<HandleCancellationOutput> {
  try {
    const result = await handleCancellation(input);
    return result;
  } catch (error) {
    console.error("Error in handleCancellationAction:", error);
    throw new Error("Failed to handle cancellation with AI.");
  }
}

export async function chatAction(input: ChatInput): Promise<ChatOutput> {
  try {
    const result = await chat(input);
    return result;
  } catch (error) {
    console.error("Error in chatAction:", error);
    throw new Error("Failed to get response from AI.");
  }
}

function initializeServerApp() {
    const apps = getApps();
    const serverAppName = 'firebase-server-action';
    const serverApp = apps.find(app => app.name === serverAppName);
    if (serverApp) {
        return getFirestore(serverApp);
    }
    const newApp = initializeApp(firebaseConfig, serverAppName);
    return getFirestore(newApp);
}

export async function seedDatabaseAction(): Promise<{ success: boolean, message: string }> {
    const firestore = initializeServerApp();
    if (!firestore) {
        return { success: false, message: 'Firestore is not initialized.' };
    }

    const batch = writeBatch(firestore);

    // Seed Users
    const usersCollection = collection(firestore, 'users');
    const existingUsersSnap = await getDocs(query(usersCollection));
    const existingEmails = new Set(existingUsersSnap.docs.map(doc => doc.data().email));

    let usersAdded = 0;
    mockPlayers.forEach(player => {
        const email = `${player.firstName?.toLowerCase()}.${player.lastName?.toLowerCase()}@example.com`;
        if (!existingEmails.has(email)) {
            const userRef = collection(firestore, 'users').doc();
             batch.set(userRef, {
                firstName: player.firstName,
                lastName: player.lastName,
                email: email,
                avatarUrl: player.avatarUrl,
                phone: player.phone || '',
             });
            usersAdded++;
        }
    });

    // Seed Courts
    const courtsCollection = collection(firestore, 'courts');
    const existingCourtsSnap = await getDocs(courtsCollection);
    const existingCourtNames = new Set(existingCourtsSnap.docs.map(doc => doc.data().name));
    
    let courtsAdded = 0;
    mockCourts.forEach(court => {
        if (!existingCourtNames.has(court.name)) {
            const courtRef = collection(firestore, 'courts').doc();
            batch.set(courtRef, {
                name: court.name,
                location: court.location,
            });
            courtsAdded++;
        }
    });

    try {
        await batch.commit();
        return { success: true, message: `Successfully seeded database. Added ${usersAdded} users and ${courtsAdded} courts.` };
    } catch (e: any) {
        console.error("Error seeding database:", e);
        return { success: false, message: `Error seeding database: ${e.message}` };
    }
}
