'use server';

import { extractProfilePreferences, ProfilePreferenceExtractionInput, ProfilePreferenceExtractionOutput } from "@/ai/flows/profile-preference-extraction";
import { handleCancellation, HandleCancellationInput, HandleCancellationOutput } from "@/ai/flows/automated-cancellation-management";
import { chat } from "@/ai/flows/chat";
import type { ChatInput, ChatOutput, Player } from "@/lib/types";
import { players as mockPlayers, courts as mockCourts } from '@/lib/data';
import { collection, writeBatch, getDocs, doc, getFirestore, addDoc, query, where, Timestamp } from 'firebase/firestore';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { firebaseConfig } from "@/firebase/config";
import { sendSmsTool } from "@/ai/tools/sms";

// Helper function to check if a message is a simple confirmation
function isConfirmation(message: string) {
  const lowerMessage = message.toLowerCase().trim();
  return ['yes', 'yep', 'yeah', 'ok', 'okay', 'sounds good', 'confirm', 'do it', 'try again', 'i did, yes.'].includes(lowerMessage);
}


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
  const firestore = initializeServerApp();

  const usersSnapshot = await getDocs(collection(firestore, 'users'));
  const allPlayers: Player[] = [];
  usersSnapshot.forEach(doc => {
      const data = doc.data();
      // This needs a way to identify the current user. For now, we'll assume it's passed in or identifiable.
      allPlayers.push({
          id: doc.id,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          avatarUrl: data.avatarUrl,
          phone: data.phone,
      });
  });
  
  // A real implementation needs to identify the current user based on the session.
  // For now, we'll default to the first user for demo purposes if no `isCurrentUser` is set.
  const currentUser = allPlayers.find(p => p.isCurrentUser) || allPlayers[0];
  const knownPlayersWithCurrentUser = allPlayers.map(p => ({...p, isCurrentUser: p.id === currentUser.id }));


  try {
    const result = await chat(input, knownPlayersWithCurrentUser);

    const wasConfirmation = isConfirmation(input.message);

    // If we have all details and it was a confirmation, save the game and send SMS
    if (wasConfirmation && result.date && result.time && result.location && result.invitedPlayers && result.currentUser) {
        
        const { date, time, location, invitedPlayers, currentUser } = result;
        
        const otherPlayers = invitedPlayers.filter(p => p.id !== currentUser.id);
        const otherPlayerNames = otherPlayers.map(p => p.name).join(' and ');
        
        const smsBody = `Pickleball Game Invitation! You're invited to a game on ${date} at ${time} at ${location}. Respond YES or NO. Manage your profile at https://localdink.app/join`;
        for (const player of otherPlayers) {
            if(player.phone) { 
                await sendSmsTool({ to: player.phone!, body: smsBody });
            }
        }

        try {
            const courtsRef = collection(firestore, 'courts');
            const q = query(courtsRef, where("name", "==", location));
            const courtSnapshot = await getDocs(q);
            let courtId = 'unknown';
            if (!courtSnapshot.empty) {
                courtId = courtSnapshot.docs[0].id;
            } else {
              const newCourt = await addDoc(courtsRef, { name: location, location: 'Unknown' });
              courtId = newCourt.id;
            }
            
            const organizerId = currentUser.id;
            const playerIds = invitedPlayers.map(p => p.id).filter((id): id is string => !!id);

            const [hour, minute] = time.split(/[:\s]/);
            const ampm = time.includes('PM') ? 'PM' : 'AM';
            let numericHour = parseInt(hour, 10);
            if (ampm === 'PM' && numericHour < 12) {
                numericHour += 12;
            }
            if (ampm === 'AM' && numericHour === 12) {
                numericHour = 0;
            }
            const numericMinute = parseInt(minute, 10) || 0;

            const startTime = new Date(date);
            startTime.setHours(numericHour, numericMinute);
            
            await addDoc(collection(firestore, 'game-sessions'), {
                courtId,
                organizerId,
                startTime: Timestamp.fromDate(startTime),
                isDoubles: playerIds.length > 2,
                durationMinutes: 120,
                status: 'scheduled',
                playerIds,
            });

            const finalConfirmation = otherPlayerNames
                ? `Excellent. I will notify ${otherPlayerNames} and get this scheduled right away.`
                : `Excellent. I have scheduled your game.`;
            result.confirmationText = finalConfirmation;

        } catch(e) {
            console.error("Failed to save game session to firestore", e);
            result.confirmationText = "I was able to schedule the game, but I ran into a problem saving it. Please check your games list."
        }
    }


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
    const usersCollectionRef = collection(firestore, 'users');
    const existingUsersSnap = await getDocs(usersCollectionRef);
    const existingEmails = new Set(existingUsersSnap.docs.map(doc => doc.data().email));

    let usersAdded = 0;
    mockPlayers.forEach(player => {
        const email = `${player.firstName?.toLowerCase()}.${player.lastName?.toLowerCase()}@example.com`;
        if (!existingEmails.has(email)) {
            const userRef = doc(usersCollectionRef); // Correct syntax
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
    const courtsCollectionRef = collection(firestore, 'courts');
    const existingCourtsSnap = await getDocs(courtsCollectionRef);
    const existingCourtNames = new Set(existingCourtsSnap.docs.map(doc => doc.data().name));
    
    let courtsAdded = 0;
    mockCourts.forEach(court => {
        if (!existingCourtNames.has(court.name)) {
            const courtRef = doc(courtsCollectionRef); // Correct syntax
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
