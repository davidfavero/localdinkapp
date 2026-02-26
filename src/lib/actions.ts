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
import type { ChatInput, ChatOutput, Player, Group, Court } from "./types";
import { normalizeToE164 } from "@/server/twilio";

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
    knownGroups?: (Group & { id: string })[],
    knownCourts?: Court[]
): Promise<ChatOutput> {
    const { message, history } = input;

    // Use only user-scoped data from client-side.
    // Never broaden to global users/players/groups server-side.
    let players: Player[] = knownPlayers || [];
    let groups: (Group & { id: string })[] = knownGroups || [];
    let courts: Court[] = knownCourts || [];

    if (currentUser?.id) {
        players = players.filter(
            (p) => p.id === currentUser.id || p.ownerId === currentUser.id || p.isCurrentUser
        );
        groups = groups.filter((g) => g.ownerId === currentUser.id);
        courts = courts.filter((c) => c.ownerId === currentUser.id);
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
    console.log('[chatAction] Known courts:', courts.map(c => c.name));
    
    try {
        const { chat } = await import("@/ai/flows/chat");
        const disambiguationMemory = currentUser?.nameDisambiguationMemory || {};
        const response = await chat(knownPlayersWithCurrent, { message, history }, groups, courts, disambiguationMemory);

        if (currentUser?.id) {
            const adminDb = await getAdminDb();
            if (adminDb) {
                if (response.disambiguationMemoryUpdates && Object.keys(response.disambiguationMemoryUpdates).length > 0) {
                    const mergedMemory = {
                        ...(disambiguationMemory || {}),
                        ...response.disambiguationMemoryUpdates,
                    };
                    await adminDb.collection('users').doc(currentUser.id).set(
                        { nameDisambiguationMemory: mergedMemory },
                        { merge: true }
                    );
                }

                await adminDb.collection('robin-actions').add({
                    userId: currentUser.id,
                    inputMessage: message,
                    extractedPlayers: response.players || [],
                    extractedDate: response.date || null,
                    extractedTime: response.time || null,
                    extractedLocation: response.location || null,
                    invitedPlayers: (response.invitedPlayers || []).map((p) => ({
                        id: p.id || null,
                        name: p.name,
                    })),
                    createdSessionId: response.createdSessionId || null,
                    notifiedCount: response.notifiedCount || 0,
                    skippedPlayers: response.skippedPlayers || [],
                    createdAt: new Date().toISOString(),
                });
            }
        }
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

export async function addCourtAction(
    courtData: {
        name: string;
        location: string;
        address?: string;
        city?: string;
        state?: string;
        timezone?: string;
    },
    userId: string
): Promise<{ success: boolean; courtId?: string; message: string }> {
    try {
        const adminDb = await getAdminDb();
        if (!adminDb) {
            return { success: false, message: 'Database not available' };
        }

        let fallbackTimezone = '';
        const userDoc = await adminDb.collection('users').doc(userId).get();
        if (userDoc.exists) {
            fallbackTimezone = userDoc.data()?.timezone || '';
        }

        const newCourt = {
            name: courtData.name,
            location: courtData.location || courtData.city || '',
            address: courtData.address || '',
            city: courtData.city || '',
            state: courtData.state || '',
            ownerId: userId,
            timezone: courtData.timezone || fallbackTimezone || 'America/New_York',
            createdAt: new Date().toISOString(),
        };

        const courtRef = await adminDb.collection('courts').add(newCourt);
        
        return { 
            success: true, 
            courtId: courtRef.id,
            message: `Added "${courtData.name}" to your courts!`
        };
    } catch (error: any) {
        console.error('Error adding court:', error);
        return { success: false, message: error.message || 'Failed to add court' };
    }
}

export async function undoRecentSessionAction(
    sessionId: string,
    userId: string
): Promise<{ success: boolean; message: string }> {
    try {
        const adminDb = await getAdminDb();
        if (!adminDb) {
            return { success: false, message: 'Database not available' };
        }

        const sessionRef = adminDb.collection('game-sessions').doc(sessionId);
        const sessionDoc = await sessionRef.get();
        if (!sessionDoc.exists) {
            return { success: false, message: 'Session not found.' };
        }

        const sessionData = sessionDoc.data() || {};
        if (sessionData.organizerId !== userId) {
            return { success: false, message: 'You can only undo sessions you created.' };
        }

        const createdAtRaw = sessionData.createdAt;
        let createdAtMs = 0;
        if (createdAtRaw?.toDate) {
            createdAtMs = createdAtRaw.toDate().getTime();
        } else if (typeof createdAtRaw === 'string') {
            createdAtMs = new Date(createdAtRaw).getTime();
        } else {
            createdAtMs = 0;
        }

        if (!createdAtMs || Date.now() - createdAtMs > 10 * 60 * 1000) {
            return { success: false, message: 'Undo window expired (10 minutes).' };
        }

        await sessionRef.delete();
        return { success: true, message: 'Session undone successfully.' };
    } catch (error: any) {
        console.error('Error undoing session:', error);
        return { success: false, message: error?.message || 'Failed to undo session.' };
    }
}

export async function addPlayerAction(
    playerData: {
        firstName: string;
        lastName: string;
        email?: string;
        phone?: string;
    },
    userId: string
): Promise<{ success: boolean; playerId?: string; message: string }> {
    try {
        const adminDb = await getAdminDb();
        if (!adminDb) {
            return { success: false, message: 'Database not available' };
        }

        const normalizedPhone = normalizeToE164(playerData.phone);

        const newPlayer = {
            firstName: playerData.firstName,
            lastName: playerData.lastName || '',
            email: playerData.email?.toLowerCase().trim() || '',
            phone: normalizedPhone || '',
            avatarUrl: '',
            ownerId: userId,
            createdAt: new Date().toISOString(),
        };

        // Check if a user with this email already exists (for linking)
        let linkedUserId: string | undefined;
        if (newPlayer.email) {
            try {
                const existingUser = await adminDb.collection('users')
                    .where('email', '==', newPlayer.email)
                    .limit(1)
                    .get();
                if (!existingUser.empty) {
                    linkedUserId = existingUser.docs[0].id;
                }
            } catch (e) {
                console.warn('Could not check for existing user:', e);
            }
        }

        const playerRef = await adminDb.collection('players').add({
            ...newPlayer,
            ...(linkedUserId && { linkedUserId }),
        });
        
        return { 
            success: true, 
            playerId: playerRef.id,
            message: `Added ${playerData.firstName} ${playerData.lastName || ''} to your contacts!`
        };
    } catch (error: any) {
        console.error('Error adding player:', error);
        return { success: false, message: error.message || 'Failed to add player' };
    }
}

export async function updateRsvpStatusAction(
    sessionId: string,
    playerId: string,
    status: 'CONFIRMED' | 'DECLINED'
): Promise<{ success: boolean; message: string }> {
    try {
        const adminDb = await getAdminDb();
        if (!adminDb) {
            return { success: false, message: 'Database not available' };
        }

        const sessionRef = adminDb.collection('game-sessions').doc(sessionId);
        const sessionDoc = await sessionRef.get();
        
        if (!sessionDoc.exists) {
            return { success: false, message: 'Game session not found' };
        }

        const sessionData = sessionDoc.data();
        const currentStatuses = sessionData?.playerStatuses || {};
        
        // Update the player's status
        await sessionRef.update({
            [`playerStatuses.${playerId}`]: status,
        });

        // Send in-app notification to organizer
        if (sessionData?.organizerId && sessionData.organizerId !== playerId) {
            try {
                const { sendRsvpNotification } = await import('./notifications');
                
                // Get player name
                const playerDoc = await adminDb.collection('users').doc(playerId).get();
                const playerData = playerDoc.exists ? playerDoc.data() : null;
                const playerName = playerData 
                    ? `${playerData.firstName || ''} ${playerData.lastName || ''}`.trim() || 'A player'
                    : 'A player';
                
                const matchType = sessionData.isDoubles ? 'Doubles' : 'Singles';
                const gameDate = sessionData.startTimeDisplay || 'upcoming game';
                
                await sendRsvpNotification({
                    organizerId: sessionData.organizerId,
                    responderId: playerId,
                    responderName: playerName,
                    gameSessionId: sessionId,
                    matchType,
                    date: gameDate,
                    accepted: status === 'CONFIRMED',
                });
            } catch (notifError) {
                console.error('Error sending RSVP notification:', notifError);
                // Don't fail the action if notification fails
            }
        }

        return { 
            success: true, 
            message: status === 'CONFIRMED' 
                ? "You're in! See you at the game." 
                : "No problem, I've declined the invite for you."
        };
    } catch (error: any) {
        console.error('Error updating RSVP status:', error);
        return { success: false, message: error.message || 'Failed to update RSVP' };
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