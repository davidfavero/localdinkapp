/**
 * @fileOverview Relay message tool — sends a message from one player to
 * all participants of their upcoming/recent game session via SMS.
 *
 * Robin uses this to relay messages like "tell everyone I'm running late"
 * or "ask David if he can bring an extra paddle".
 */

import { getAdminDb } from '@/firebase/admin';
import { normalizeToE164, sendSmsMessage } from '@/server/twilio';
import { generateRobinSms, appendStopFooter } from '@/ai/flows/robin-sms';

export type RelayMessageParams = {
  /** The user ID of the person sending the relay */
  senderId: string;
  /** The sender's display name (e.g. "David") */
  senderName: string;
  /** The sender's phone number (to exclude from relay recipients) */
  senderPhone: string;
  /** The message to relay */
  message: string;
  /** Optional: specific game session ID. If omitted, finds the nearest upcoming game. */
  gameSessionId?: string;
};

export type RelayMessageResult = {
  success: boolean;
  relayedTo: number;
  gameSessionId?: string;
  error?: string;
};

/**
 * Find the nearest upcoming or recent game for a player and relay a message
 * to all other participants via SMS.
 */
export async function relayMessage(params: RelayMessageParams): Promise<RelayMessageResult> {
  const { senderId, senderName, senderPhone, message, gameSessionId } = params;

  const adminDb = await getAdminDb();
  if (!adminDb) {
    return { success: false, relayedTo: 0, error: 'Database not available' };
  }

  try {
    let gameData: Record<string, any> | null = null;
    let resolvedGameId: string | undefined;

    if (gameSessionId) {
      // Look up specific game
      const gameDoc = await adminDb.collection('game-sessions').doc(gameSessionId).get();
      if (gameDoc.exists) {
        gameData = gameDoc.data()!;
        resolvedGameId = gameDoc.id;
      }
    } else {
      // Find the nearest upcoming game where this player is confirmed or pending.
      // Check all possible IDs for this user.
      const idsToSearch = [senderId];

      // Also check for linked player docs
      const linkedPlayers = await adminDb.collection('players')
        .where('linkedUserId', '==', senderId)
        .get();
      for (const doc of linkedPlayers.docs) {
        idsToSearch.push(doc.id);
      }

      const now = new Date();

      // Search for games starting within the last 3 hours (in progress) or upcoming
      const recentCutoff = new Date(now.getTime() - 3 * 60 * 60 * 1000);

      for (const id of idsToSearch) {
        const snap = await adminDb.collection('game-sessions')
          .where('playerIds', 'array-contains', id)
          .where('status', 'in', ['open', 'full'])
          .where('startTime', '>=', recentCutoff)
          .orderBy('startTime', 'asc')
          .limit(1)
          .get();

        if (!snap.empty) {
          const doc = snap.docs[0];
          gameData = doc.data();
          resolvedGameId = doc.id;
          break;
        }
      }
    }

    if (!gameData || !resolvedGameId) {
      return {
        success: false,
        relayedTo: 0,
        error: 'No upcoming game found to relay the message to.',
      };
    }

    // Get all player IDs from the game
    const playerIds: string[] = gameData.playerIds || [];
    const senderNormalizedPhone = normalizeToE164(senderPhone);

    // Collect phone numbers for all other participants
    const recipientPhones = new Set<string>();

    for (const playerId of playerIds) {
      // Skip the sender
      if (playerId === senderId) continue;

      // Try users collection first, then players
      let phone: string | undefined;

      const userDoc = await adminDb.collection('users').doc(playerId).get();
      if (userDoc.exists) {
        phone = normalizeToE164(userDoc.data()?.phone) || undefined;
      }

      if (!phone) {
        const playerDoc = await adminDb.collection('players').doc(playerId).get();
        if (playerDoc.exists) {
          phone = normalizeToE164(playerDoc.data()?.phone) || undefined;
        }
      }

      // Also check if this is a linked user — resolve to get phone
      if (!phone) {
        const linkedSnap = await adminDb.collection('players')
          .where('linkedUserId', '==', playerId)
          .limit(1)
          .get();
        if (!linkedSnap.empty) {
          phone = normalizeToE164(linkedSnap.docs[0].data()?.phone) || undefined;
        }
      }

      if (phone && phone !== senderNormalizedPhone) {
        recipientPhones.add(phone);
      }
    }

    if (recipientPhones.size === 0) {
      return {
        success: false,
        relayedTo: 0,
        gameSessionId: resolvedGameId,
        error: 'No other players with phone numbers found in this game.',
      };
    }

    // Generate Robin-voiced relay message
    const relayText = await generateRobinSms({
      messageType: 'message_relay',
      details: {
        senderName,
        message,
      },
    });
    let sentCount = 0;

    for (const phone of recipientPhones) {
      try {
        await sendSmsMessage({ to: phone, body: await appendStopFooter(relayText) });
        sentCount++;
      } catch (err) {
        console.error(`[relay-message] Failed to send to ${phone}:`, err);
      }
    }

    console.log(`[relay-message] Relayed "${message}" from ${senderName} to ${sentCount} players for game ${resolvedGameId}`);

    return {
      success: true,
      relayedTo: sentCount,
      gameSessionId: resolvedGameId,
    };
  } catch (error) {
    console.error('[relay-message] Error:', error);
    return { success: false, relayedTo: 0, error: 'Failed to relay message' };
  }
}
