'use server';

import type {
  ProfilePreferenceExtractionInput,
  ProfilePreferenceExtractionOutput,
} from "@/ai/flows/profile-preference-extraction";
import { getAdminDb } from "@/firebase/admin";
import { players, mockCourts } from "@/lib/data";
import type { ChatInput, ChatOutput, Player, Group, Court } from "./types";
import { normalizeToE164, sendSmsMessage, isTwilioConfigured } from "@/server/twilio";
import { FieldValue } from 'firebase-admin/firestore';

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
  input: { gameSessionId: string; playerId: string }
): Promise<{ success: boolean; message: string }> {
  try {
    const { handleCancel } = await import("@/lib/rsvp-handler");
    const result = await handleCancel(input.playerId, input.gameSessionId);
    return { success: result.success, message: result.message };
  } catch (error) {
    console.error("Error in handleCancellationAction:", error);
    throw new Error("Failed to process cancellation.");
  }
}

export async function deleteGameSessionAction(
  input: { gameSessionId: string; organizerId: string }
): Promise<{ success: boolean; message: string }> {
  try {
    const adminDb = await getAdminDb();
    if (!adminDb) throw new Error("Database not available");

    const sessionRef = adminDb.collection('game-sessions').doc(input.gameSessionId);
    const sessionDoc = await sessionRef.get();
    if (!sessionDoc.exists) {
      return { success: false, message: 'Game session not found.' };
    }

    const session = sessionDoc.data()!;

    // Verify the requester is the organizer
    if (session.organizerId !== input.organizerId) {
      return { success: false, message: 'Only the organizer can delete a game session.' };
    }

    // Collect all player IDs who need to be notified (exclude organizer)
    const playerIds = Object.entries(session.playerStatuses || {})
      .filter(([id, status]) => id !== input.organizerId && status !== 'CANCELLED' && status !== 'DECLINED')
      .map(([id]) => id);

    // Get court name for notification
    let courtName = 'the court';
    if (session.courtId) {
      const courtDoc = await adminDb.collection('courts').doc(session.courtId).get();
      if (courtDoc.exists) courtName = courtDoc.data()!.name || courtName;
    }

    // Format date for notifications
    const startTime = session.startTime?.toDate ? session.startTime.toDate() : new Date(session.startTime);
    const dateStr = startTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const timeStr = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    // Notify all affected players via SMS
    const { generateRobinSms, appendStopFooter } = await import('@/ai/flows/robin-sms');
    
    for (const playerId of playerIds) {
      try {
        // Try users collection first, then players collection
        let playerDoc = await adminDb.collection('users').doc(playerId).get();
        let phone: string | undefined;
        let firstName: string | undefined;

        if (playerDoc.exists) {
          phone = playerDoc.data()!.phone;
          firstName = playerDoc.data()!.firstName;
        } else {
          playerDoc = await adminDb.collection('players').doc(playerId).get();
          if (playerDoc.exists) {
            phone = playerDoc.data()!.phone;
            firstName = playerDoc.data()!.firstName;
          }
        }

        if (phone) {
          const smsBody = await generateRobinSms({
            messageType: 'game_cancelled',
            details: {
              recipientName: firstName || 'there',
              matchType: session.isDoubles ? 'Doubles' : 'Singles',
              date: `${dateStr} at ${timeStr}`,
              courtName,
            },
          });
          const normalized = normalizeToE164(phone);
          if (normalized) {
            await sendSmsMessage({ to: normalized, body: await appendStopFooter(smsBody) });
          }
        }

        // Send in-app notification
        await adminDb.collection('notifications').add({
          userId: playerId,
          type: 'GAME_CANCELLED',
          title: 'Game Cancelled',
          body: `The ${session.isDoubles ? 'doubles' : 'singles'} game at ${courtName} on ${dateStr} at ${timeStr} has been cancelled by the organizer.`,
          read: false,
          createdAt: FieldValue.serverTimestamp(),
          data: { gameSessionId: input.gameSessionId },
        });
      } catch (err) {
        console.error(`[deleteGameSession] Failed to notify player ${playerId}:`, err);
      }
    }

    // Delete players subcollection
    const playersSnap = await sessionRef.collection('players').get();
    const batch = adminDb.batch();
    playersSnap.docs.forEach(d => batch.delete(d.ref));
    batch.delete(sessionRef);
    await batch.commit();

    return { success: true, message: `Game deleted. ${playerIds.length > 0 ? `Notified ${playerIds.length} player${playerIds.length === 1 ? '' : 's'}.` : ''}` };
  } catch (error) {
    console.error("Error in deleteGameSessionAction:", error);
    throw new Error("Failed to delete game session.");
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

        // Build play frequency map from game history for smarter name disambiguation
        const playFrequency: Record<string, number> = {};
        if (currentUser?.id) {
            const adminDb = await getAdminDb();
            if (adminDb) {
                const sessionsSnap = await adminDb.collection('game-sessions')
                    .where('playerIds', 'array-contains', currentUser.id)
                    .get();

                const now = Date.now();
                const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
                for (const doc of sessionsSnap.docs) {
                    const data = doc.data();
                    const sessionTime = data.startTime?.toMillis?.() || 0;
                    const weight = (now - sessionTime) < NINETY_DAYS_MS ? 1.0 : 0.5;
                    for (const playerId of (data.playerIds || [])) {
                        if (playerId === currentUser.id) continue;
                        const player = knownPlayersWithCurrent.find(p => p.id === playerId);
                        if (player) {
                            const fullName = `${player.firstName} ${player.lastName}`;
                            playFrequency[fullName] = (playFrequency[fullName] || 0) + weight;
                        }
                    }
                }
            }
        }

        const response = await chat(knownPlayersWithCurrent, { message, history }, groups, courts, disambiguationMemory, playFrequency);

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

/**
 * After a new user creates their account, find any player contacts across all
 * users that match this person's phone or email and set linkedUserId on them.
 * This lets other users who already added this person as a contact immediately
 * message them in-app.
 */

async function updateUserProfileNameFromPlayer(
    adminDb: FirebaseFirestore.Firestore,
    userId: string,
    playerData: { firstName?: string; lastName?: string }
) {
    try {
        const userDoc = await adminDb.collection('users').doc(userId).get();
        if (!userDoc.exists) return;
        const userData = userDoc.data()!;
        const currentName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim();
        if (!currentName || currentName === 'New User') {
            const playerName = `${playerData.firstName || ''} ${playerData.lastName || ''}`.trim();
            if (playerName) {
                await userDoc.ref.update({
                    firstName: playerData.firstName || '',
                    lastName: playerData.lastName || '',
                });
                console.log(`[linkPlayerContacts] Updated user ${userId} profile name to "${playerName}"`);
            }
        }
    } catch (e) {
        console.warn('[linkPlayerContacts] Could not update user profile name:', e);
    }
}

/**
 * When a player contact is linked to a registered user, update any existing
 * game sessions that reference the old player-contact doc ID so the user's
 * auth UID is added to `playerIds` (making the session visible on their dashboard)
 * and the `attendees` array reflects the correct source.
 */
async function migrateGameSessionsForLinkedPlayer(
    adminDb: FirebaseFirestore.Firestore,
    playerDocIds: string[],
    userId: string,
) {
    for (const playerDocId of playerDocIds) {
        try {
            const sessionsSnap = await adminDb.collection('game-sessions')
                .where('playerIds', 'array-contains', playerDocId)
                .get();

            for (const sessionDoc of sessionsSnap.docs) {
                const data = sessionDoc.data();
                const updates: Record<string, any> = {};

                // Add the user's UID to playerIds if not already present
                const currentPlayerIds: string[] = data.playerIds || [];
                if (!currentPlayerIds.includes(userId)) {
                    updates.playerIds = [...currentPlayerIds.filter(id => id !== playerDocId), userId];
                }

                // Update attendees array: swap player-source entry to user-source
                if (Array.isArray(data.attendees)) {
                    updates.attendees = data.attendees.map((a: any) => {
                        if (a.id === playerDocId && a.source === 'player') {
                            return { id: userId, source: 'user' };
                        }
                        return a;
                    });
                }

                // Migrate playerStatuses key from old ID to user UID
                if (data.playerStatuses?.[playerDocId] && !data.playerStatuses?.[userId]) {
                    updates[`playerStatuses.${userId}`] = data.playerStatuses[playerDocId];
                    updates[`playerStatuses.${playerDocId}`] = FieldValue.delete();
                }

                if (Object.keys(updates).length > 0) {
                    await sessionDoc.ref.update(updates);
                    console.log(`[linkPlayerContacts] Migrated session ${sessionDoc.id}: swapped player ${playerDocId} -> user ${userId}`);
                }
            }
        } catch (e) {
            console.warn(`[linkPlayerContacts] Could not migrate sessions for player ${playerDocId}:`, e);
        }
    }
}

export async function linkPlayerContactsAction(
    userId: string,
    phone?: string | null,
    email?: string | null
): Promise<{ linkedCount: number }> {
    try {
        const adminDb = await getAdminDb();
        if (!adminDb) return { linkedCount: 0 };

        const normalizedPhone = normalizeToE164(phone ?? undefined);
        const normalizedEmail = email?.toLowerCase().trim();
        let linkedCount = 0;
        const linkedPlayerDocIds: string[] = [];

        console.log(`[linkPlayerContacts] Attempting to link for user ${userId}`);
        console.log(`[linkPlayerContacts] Phone: ${phone} -> normalized: ${normalizedPhone}`);
        console.log(`[linkPlayerContacts] Email: ${email} -> normalized: ${normalizedEmail}`);

        // Find player contacts matching by phone — check multiple formats
        // because older contacts may have been saved with raw input (e.g. "404-538-9332")
        if (normalizedPhone) {
            // Build set of phone format variants to search for
            const digits = normalizedPhone.replace(/\D/g, ''); // e.g. "14045389332"
            const last10 = digits.slice(-10); // e.g. "4045389332"
            const phoneVariants = new Set([
                normalizedPhone,                           // +14045389332
                last10,                                    // 4045389332
                `${last10.slice(0,3)}-${last10.slice(3,6)}-${last10.slice(6)}`, // 404-538-9332
                `(${last10.slice(0,3)}) ${last10.slice(3,6)}-${last10.slice(6)}`, // (404) 538-9332
                `1${last10}`,                              // 14045389332
            ]);

            for (const variant of phoneVariants) {
                const byPhone = await adminDb.collection('players')
                    .where('phone', '==', variant)
                    .get();
                for (const doc of byPhone.docs) {
                    const data = doc.data();
                    console.log(`[linkPlayerContacts] Found player ${doc.id} (${data.firstName} ${data.lastName}) with phone "${variant}", ownerId=${data.ownerId}, linkedUserId=${data.linkedUserId || 'none'}`);
                    if (!data.linkedUserId && data.ownerId !== userId) {
                        // Link AND normalize the stored phone for future matches
                        await doc.ref.update({ linkedUserId: userId, phone: normalizedPhone });
                        linkedCount++;
                        linkedPlayerDocIds.push(doc.id);
                        console.log(`[linkPlayerContacts] ✓ Linked player ${doc.id} to user ${userId}`);
                        // If user profile has empty/default name, update it from the player contact
                        await updateUserProfileNameFromPlayer(adminDb, userId, data);
                    } else if (data.linkedUserId === userId && data.ownerId !== userId) {
                        // Already linked — still collect for session migration in case
                        // prior linking happened before migration logic was added
                        linkedPlayerDocIds.push(doc.id);
                    } else {
                        console.log(`[linkPlayerContacts] ✗ Skipped: linkedUserId=${data.linkedUserId || 'none'}, ownerId=${data.ownerId}, targetUserId=${userId}`);
                    }
                }
            }
        }

        // Find player contacts matching by email
        if (normalizedEmail) {
            const byEmail = await adminDb.collection('players')
                .where('email', '==', normalizedEmail)
                .get();
            for (const doc of byEmail.docs) {
                const data = doc.data();
                if (!data.linkedUserId && data.ownerId !== userId) {
                    await doc.ref.update({ linkedUserId: userId });
                    linkedCount++;
                    linkedPlayerDocIds.push(doc.id);

                    // If user profile has empty/default name, update it from the player contact
                    await updateUserProfileNameFromPlayer(adminDb, userId, data);
                } else if (data.linkedUserId === userId && data.ownerId !== userId) {
                    // Already linked — still collect for session migration
                    linkedPlayerDocIds.push(doc.id);
                }
            }
        }

        // Migrate existing game sessions that reference the old player contact IDs
        // so the linked user can see them in their dashboard
        if (linkedPlayerDocIds.length > 0) {
            await migrateGameSessionsForLinkedPlayer(adminDb, linkedPlayerDocIds, userId);
        }

        if (linkedCount > 0) {
            console.log(`[linkPlayerContacts] Linked ${linkedCount} player contacts to user ${userId}`);
        }
        return { linkedCount };
    } catch (error) {
        console.error('Error linking player contacts:', error);
        return { linkedCount: 0 };
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

        // Check if a user with this email or phone already exists (for linking)
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
                console.warn('Could not check for existing user by email:', e);
            }
        }

        // Also check by phone number (users who signed in via phone auth)
        if (!linkedUserId && normalizedPhone) {
            try {
                const existingUser = await adminDb.collection('users')
                    .where('phone', '==', normalizedPhone)
                    .limit(1)
                    .get();
                if (!existingUser.empty) {
                    linkedUserId = existingUser.docs[0].id;
                }
            } catch (e) {
                console.warn('Could not check for existing user by phone:', e);
            }
        }

        const playerRef = await adminDb.collection('players').add({
            ...newPlayer,
            ...(linkedUserId && { linkedUserId }),
        });

        // Send invite SMS to new contacts who aren't registered users yet
        if (normalizedPhone && !linkedUserId && isTwilioConfigured()) {
            try {
                // Look up who's adding them
                const adderDoc = await adminDb.collection('users').doc(userId).get();
                const adderData = adderDoc.exists ? adderDoc.data() : null;
                const adderName = adderData
                    ? `${adderData.firstName || ''} ${adderData.lastName || ''}`.trim() || 'A friend'
                    : 'A friend';

                // Generate Robin-voiced welcome SMS
                const { generateRobinSms, appendStopFooter } = await import('@/ai/flows/robin-sms');
                const inviteBody = await generateRobinSms({
                    messageType: 'welcome',
                    details: {
                        recipientName: playerData.firstName,
                        adderName,
                    },
                    isFirstContact: true,
                });

                await sendSmsMessage({ to: normalizedPhone, body: await appendStopFooter(inviteBody) });
                console.log(`[add-player] Sent Robin welcome SMS to ${normalizedPhone} for ${playerData.firstName}`);
            } catch (smsError) {
                // Don't fail the player creation if SMS fails
                console.warn('[add-player] Failed to send invite SMS:', smsError);
            }
        }
        
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

/**
 * Send SMS opt-in confirmation and record consent timestamp.
 * Called when a user enables SMS notifications.
 */
export async function sendSmsOptInAction(
    userId: string,
    phone: string
): Promise<{ success: boolean; message: string }> {
    try {
        const { sendOptInConfirmation } = await import('@/lib/sms-compliance');
        const sent = await sendOptInConfirmation(userId, phone);
        return {
            success: sent,
            message: sent
                ? 'SMS notifications enabled. A confirmation text has been sent.'
                : 'Could not send confirmation text. SMS may not be configured.',
        };
    } catch (error: any) {
        console.error('Error sending SMS opt-in:', error);
        return { success: false, message: error.message || 'Failed to send confirmation' };
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

export async function createConversationAction(params: {
    creatorId: string;
    participantIds: string[];
    type: '1:1' | 'group';
    groupName?: string;
    /** Player doc IDs for participants who don't have user accounts yet */
    playerParticipantIds?: string[];
}): Promise<{ success: boolean; conversationId?: string; message: string }> {
    try {
        const adminDb = await getAdminDb();
        if (!adminDb) {
            return { success: false, message: 'Database not available' };
        }

        const { creatorId, participantIds, type, groupName, playerParticipantIds = [] } = params;

        // Build the full list of participant IDs (user UIDs + player:PLAYER_ID for unlinked)
        const allParticipantIds = [
            ...participantIds,
            ...playerParticipantIds.map(id => `player:${id}`),
        ];

        // For 1:1, check if conversation already exists
        if (type === '1:1' && allParticipantIds.length === 2) {
            const existing = await adminDb.collection('conversations')
                .where('type', '==', '1:1')
                .where('participantIds', 'array-contains', creatorId)
                .get();

            const other = allParticipantIds.find(id => id !== creatorId);
            const found = existing.docs.find(doc => {
                const data = doc.data();
                return data.participantIds?.includes(other) && data.participantIds?.length === 2;
            });

            if (found) {
                return { success: true, conversationId: found.id, message: 'Existing conversation found' };
            }
        }

        // Fetch participant profiles for denormalized names/avatars
        const participantNames: Record<string, string> = {};
        const participantAvatars: Record<string, string> = {};

        // Look up user accounts
        for (const uid of participantIds) {
            const userDoc = await adminDb.collection('users').doc(uid).get();
            if (userDoc.exists) {
                const data = userDoc.data()!;
                let name = `${data.firstName || ''} ${data.lastName || ''}`.trim();
                // If profile name is empty or still the default, try linked player contacts
                if (!name || name === 'New User') {
                    const linkedPlayers = await adminDb.collection('players')
                        .where('linkedUserId', '==', uid)
                        .limit(1)
                        .get();
                    if (!linkedPlayers.empty) {
                        const pd = linkedPlayers.docs[0].data();
                        name = `${pd.firstName || ''} ${pd.lastName || ''}`.trim();
                    }
                }
                participantNames[uid] = name || 'Unknown';
                participantAvatars[uid] = data.avatarUrl || '';
            }
        }

        // Look up player contacts (unlinked)
        for (const playerId of playerParticipantIds) {
            const playerDoc = await adminDb.collection('players').doc(playerId).get();
            if (playerDoc.exists) {
                const data = playerDoc.data()!;
                const key = `player:${playerId}`;
                participantNames[key] = `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'Unknown';
                participantAvatars[key] = data.avatarUrl || '';
            }
        }

        const now = FieldValue.serverTimestamp();
        const lastReadAt: Record<string, any> = {};
        for (const pid of allParticipantIds) {
            lastReadAt[pid] = now;
        }

        const conversationDoc = await adminDb.collection('conversations').add({
            type,
            participantIds: allParticipantIds,
            participantNames,
            participantAvatars,
            ...(groupName && { groupName }),
            lastActivityAt: now,
            lastReadAt,
            createdAt: now,
            createdBy: creatorId,
        });

        return { success: true, conversationId: conversationDoc.id, message: 'Conversation created' };
    } catch (error: any) {
        console.error('Error creating conversation:', error);
        return { success: false, message: error.message || 'Failed to create conversation' };
    }
}

export async function sendMessageNotificationAction(params: {
    conversationId: string;
    senderId: string;
    senderName: string;
    text: string;
}): Promise<{ success: boolean; message: string }> {
    try {
        console.log('[sendMessageNotification] Starting for conversation:', params.conversationId, 'sender:', params.senderName);
        const adminDb = await getAdminDb();
        if (!adminDb) {
            console.error('[sendMessageNotification] adminDb is null');
            return { success: false, message: 'Database not available' };
        }

        const { conversationId, senderId, senderName, text } = params;

        // Read conversation to get participants
        const convDoc = await adminDb.collection('conversations').doc(conversationId).get();
        if (!convDoc.exists) {
            return { success: false, message: 'Conversation not found' };
        }

        const convData = convDoc.data()!;
        const participantIds: string[] = convData.participantIds || [];

        // Validate sender is a participant
        if (!participantIds.includes(senderId)) {
            return { success: false, message: 'Not a participant' };
        }

        // Update conversation metadata
        await adminDb.collection('conversations').doc(conversationId).update({
            lastMessage: {
                text: text.substring(0, 100),
                senderId,
                senderName,
                sentAt: FieldValue.serverTimestamp(),
            },
            lastActivityAt: FieldValue.serverTimestamp(),
        });

        // Send notifications to other participants
        const { sendNotification } = await import('./notifications');
        const recipientIds = participantIds.filter(id => id !== senderId);
        const preview = text.length > 50 ? text.substring(0, 50) + '...' : text;

        console.log('[sendMessageNotification] Recipients:', recipientIds);

        for (const recipientId of recipientIds) {
            // Player participants (player:XXXX) — send SMS directly via Robin
            if (recipientId.startsWith('player:')) {
                const playerId = recipientId.replace('player:', '');
                try {
                    const playerDoc = await adminDb.collection('players').doc(playerId).get();
                    if (playerDoc.exists) {
                        const playerData = playerDoc.data()!;
                        const phone = normalizeToE164(playerData.phone);
                        if (phone) {
                            const { sendSmsMessage, isTwilioConfigured } = await import('@/server/twilio');
                            if (isTwilioConfigured()) {
                                const { generateRobinSms, appendStopFooter } = await import('@/ai/flows/robin-sms');
                                const robinMsg = await generateRobinSms({
                                    messageType: 'direct_message',
                                    details: {
                                        senderName,
                                        recipientName: playerData.firstName || 'there',
                                        message: text,
                                    },
                                });
                                await sendSmsMessage({
                                    to: phone,
                                    body: await appendStopFooter(robinMsg),
                                });
                                console.log(`Robin SMS sent to player ${playerId} at ${phone}`);
                            }
                        }
                    }
                } catch (smsError) {
                    console.error(`Failed to SMS player ${playerId}:`, smsError);
                }
                continue;
            }

            // Regular user participants — send in-app notification + SMS if they have a phone
            try {
                await sendNotification({
                    userId: recipientId,
                    type: 'NEW_MESSAGE',
                    data: {
                        conversationId,
                        senderName,
                        messagePreview: preview,
                    },
                    templateData: {
                        inviterName: senderName,
                    },
                });
            } catch (notifError) {
                console.error(`Failed to notify ${recipientId}:`, notifError);
            }

            // Also send SMS to registered users who have a phone number
            try {
                const userDoc = await adminDb.collection('users').doc(recipientId).get();
                console.log('[sendMessageNotification] User lookup for', recipientId, '- exists:', userDoc.exists);
                if (userDoc.exists) {
                    const userData = userDoc.data()!;
                    const phone = normalizeToE164(userData.phone);
                    console.log('[sendMessageNotification] User phone:', phone ? 'found' : 'missing/invalid', 'raw:', userData.phone);
                    if (phone) {
                        const { sendSmsMessage, isTwilioConfigured } = await import('@/server/twilio');
                        const configured = isTwilioConfigured();
                        console.log('[sendMessageNotification] Twilio configured:', configured);
                        if (configured) {
                            const { generateRobinSms, appendStopFooter } = await import('@/ai/flows/robin-sms');
                            const robinMsg = await generateRobinSms({
                                messageType: 'direct_message',
                                details: {
                                    senderName,
                                    recipientName: userData.firstName || 'there',
                                    message: text,
                                },
                            });
                            await sendSmsMessage({
                                to: phone,
                                body: await appendStopFooter(robinMsg),
                            });
                            console.log(`Robin SMS sent to user ${recipientId} at ${phone}`);
                        }
                    }
                }
            } catch (smsError) {
                console.error(`Failed to SMS user ${recipientId}:`, smsError);
            }
        }

        return { success: true, message: 'Notifications sent' };
    } catch (error: any) {
        console.error('Error sending message notification:', error);
        return { success: false, message: error.message || 'Failed to send notifications' };
    }
}

export async function sendDirectSmsAction(params: {
    senderName: string;
    recipientPhone: string;
    text: string;
}): Promise<{ success: boolean; message: string }> {
    try {
        const { sendSmsMessage, normalizeToE164, isTwilioConfigured } = await import('@/server/twilio');

        if (!isTwilioConfigured()) {
            return { success: false, message: 'SMS is not configured.' };
        }

        const normalized = normalizeToE164(params.recipientPhone);
        if (!normalized) {
            return { success: false, message: 'Invalid phone number.' };
        }

        const { generateRobinSms, appendStopFooter } = await import('@/ai/flows/robin-sms');
        const robinMsg = await generateRobinSms({
            messageType: 'direct_message',
            details: {
                senderName: params.senderName,
                message: params.text,
            },
        });
        await sendSmsMessage({ to: normalized, body: await appendStopFooter(robinMsg) });
        return { success: true, message: 'SMS sent' };
    } catch (error: any) {
        console.error('Error sending direct SMS:', error);
        return { success: false, message: error.message || 'Failed to send SMS' };
    }
}