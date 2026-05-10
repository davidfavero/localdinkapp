'use server';

/**
 * @fileOverview RSVP handling logic for game sessions.
 * Manages player responses and game state transitions.
 */

import { getAdminDb } from '@/firebase/admin';
import { sendSmsMessage, normalizeToE164, isTwilioConfigured } from '@/server/twilio';
import type { RsvpStatus, GameSessionStatus, Player } from './types';
import { FieldValue } from 'firebase-admin/firestore';
import { sendNotification, sendRsvpNotification } from './notifications';
import { generateRobinSms, appendStopFooter } from '@/ai/flows/robin-sms';

export type RsvpActionResult = {
  success: boolean;
  message: string;
  newStatus?: RsvpStatus;
  gameStatus?: GameSessionStatus;
  error?: string;
};

/**
 * Get game session by ID with admin privileges
 */
async function getGameSession(sessionId: string) {
  const adminDb = await getAdminDb();
  if (!adminDb) return null;
  
  const doc = await adminDb.collection('game-sessions').doc(sessionId).get();
  if (!doc.exists) return null;
  
  return { id: doc.id, ...doc.data() };
}

/**
 * Get player by phone number
 */
export async function getPlayerByPhone(phone: string): Promise<(Player & { id: string }) | null> {
  const adminDb = await getAdminDb();
  if (!adminDb) return null;
  
  const raw = phone?.trim();
  const normalizedPhone = normalizeToE164(raw);
  const digitsOnly = raw?.replace(/\D/g, '') || '';
  const candidatePhones = new Set<string>();

  if (raw) candidatePhones.add(raw);
  if (normalizedPhone) candidatePhones.add(normalizedPhone);
  if (digitsOnly) candidatePhones.add(digitsOnly);
  if (digitsOnly.length === 10) {
    candidatePhones.add(`+1${digitsOnly}`);
    candidatePhones.add(`1${digitsOnly}`);
  }
  if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    candidatePhones.add(`+${digitsOnly}`);
  }

  const collections = ['users', 'players'] as const;

  for (const collectionName of collections) {
    for (const candidate of candidatePhones) {
      const snap = await adminDb
        .collection(collectionName)
        .where('phone', '==', candidate)
        .limit(1)
        .get();

      if (!snap.empty) {
        const doc = snap.docs[0];
        return { id: doc.id, ...doc.data() } as Player & { id: string };
      }
    }
  }
  
  return null;
}

/**
 * Find the most recent pending game invite for a player
 */
export async function findPendingGameForPlayer(playerId: string): Promise<{ id: string; matchedPlayerId: string; [key: string]: any } | null> {
  const adminDb = await getAdminDb();
  if (!adminDb) return null;
  
  // Try both the raw ID and player: prefixed version
  const idsToTry = [playerId];
  if (!playerId.startsWith('player:')) {
    idsToTry.push(`player:${playerId}`);
  }
  
  for (const searchId of idsToTry) {
    const gamesSnap = await adminDb.collection('game-sessions')
      .where('playerIds', 'array-contains', searchId)
      .where('status', 'in', ['open', 'full'])
      .orderBy('startTime', 'desc')
      .limit(10)
      .get();
    
    // Find the most recent one where player is PENDING
    for (const doc of gamesSnap.docs) {
      const data = doc.data();
      // Check both raw and prefixed keys in playerStatuses
      const playerStatus = data.playerStatuses?.[searchId] || data.playerStatuses?.[playerId];
      if (playerStatus === 'PENDING') {
        return { id: doc.id, matchedPlayerId: searchId, ...data };
      }
    }
  }
  
  return null;
}

/**
 * Find a confirmed game for a player (for cancellation)
 */
export async function findConfirmedGameForPlayer(playerId: string): Promise<{ id: string; matchedPlayerId: string; [key: string]: any } | null> {
  const adminDb = await getAdminDb();
  if (!adminDb) return null;
  
  const idsToTry = [playerId];
  if (!playerId.startsWith('player:')) {
    idsToTry.push(`player:${playerId}`);
  }
  
  for (const searchId of idsToTry) {
    const gamesSnap = await adminDb.collection('game-sessions')
      .where('playerIds', 'array-contains', searchId)
      .where('status', 'in', ['open', 'full'])
      .orderBy('startTime', 'asc')  // Nearest upcoming game
      .limit(10)
      .get();
    
    for (const doc of gamesSnap.docs) {
      const data = doc.data();
      const playerStatus = data.playerStatuses?.[searchId] || data.playerStatuses?.[playerId];
      if (playerStatus === 'CONFIRMED') {
        return { id: doc.id, matchedPlayerId: searchId, ...data };
      }
    }
  }
  
  return null;
}

/**
 * Calculate if game should be marked as full
 */
function shouldGameBeFull(session: any): boolean {
  const playerStatuses = session.playerStatuses || {};
  const confirmedCount = Object.values(playerStatuses).filter(s => s === 'CONFIRMED').length;
  const maxPlayers = session.maxPlayers || (session.isDoubles ? 4 : 2);
  return confirmedCount >= maxPlayers;
}

/**
 * Get player details for notifications
 */
async function getPlayerDetails(playerId: string): Promise<Player | null> {
  const adminDb = await getAdminDb();
  if (!adminDb) return null;
  
  // Try users first
  const userDoc = await adminDb.collection('users').doc(playerId).get();
  if (userDoc.exists) {
    return { id: userDoc.id, ...userDoc.data() } as Player;
  }
  
  // Try players
  const playerDoc = await adminDb.collection('players').doc(playerId).get();
  if (playerDoc.exists) {
    return { id: playerDoc.id, ...playerDoc.data() } as Player;
  }
  
  return null;
}

/**
 * Send SMS notification (with error handling)
 */
async function sendSmsNotification(phone: string | undefined, message: string): Promise<boolean> {
  if (!phone || !isTwilioConfigured()) {
    console.log('[rsvp] Skipping notification - no phone or Twilio not configured');
    return false;
  }
  
  const normalized = normalizeToE164(phone);
  if (!normalized) {
    console.log('[rsvp] Invalid phone number:', phone);
    return false;
  }
  
  try {
    await sendSmsMessage({ to: normalized, body: message });
    console.log('[rsvp] Sent SMS to:', normalized);
    return true;
  } catch (error) {
    console.error('[rsvp] Failed to send SMS:', error);
    return false;
  }
}

/**
 * Handle player accepting a game invite
 */
export async function handleAccept(
  playerId: string, 
  sessionId: string
): Promise<RsvpActionResult> {
  console.log(`[rsvp] Player ${playerId} accepting game ${sessionId}`);
  
  const adminDb = await getAdminDb();
  if (!adminDb) {
    return { success: false, message: 'Database not available', error: 'no_db' };
  }
  
  const sessionRef = adminDb.collection('game-sessions').doc(sessionId);
  const sessionDoc = await sessionRef.get();
  
  if (!sessionDoc.exists) {
    return { success: false, message: 'Game not found', error: 'not_found' };
  }
  
  const session = sessionDoc.data()!;
  const currentStatus = session.playerStatuses?.[playerId];
  
  // Check if already confirmed
  if (currentStatus === 'CONFIRMED') {
    return { success: true, message: "You're already confirmed for this game!", newStatus: 'CONFIRMED' };
  }
  
  // Check if game is already full
  if (session.status === 'full' && currentStatus !== 'CONFIRMED') {
    // Add to waitlist instead
    await sessionRef.update({
      [`playerStatuses.${playerId}`]: 'WAITLIST',
      alternates: FieldValue.arrayUnion(playerId),
    });
    return { 
      success: true, 
      message: "Game is full. You've been added to the waitlist - we'll let you know if a spot opens!",
      newStatus: 'WAITLIST',
      gameStatus: 'full'
    };
  }
  
  // Update player status to CONFIRMED
  const updates: any = {
    [`playerStatuses.${playerId}`]: 'CONFIRMED',
  };

  // If this player was on waitlist, remove from alternates queue on confirm.
  if (currentStatus === 'WAITLIST') {
    updates.alternates = FieldValue.arrayRemove(playerId);
  }
  
  // Check if game should now be marked as full
  const playerStatuses = { ...session.playerStatuses, [playerId]: 'CONFIRMED' };
  const confirmedCount = Object.values(playerStatuses).filter(s => s === 'CONFIRMED').length;
  const maxPlayers = session.maxPlayers || (session.isDoubles ? 4 : 2);
  
  let gameNowFull = false;
  if (confirmedCount >= maxPlayers && session.status !== 'full') {
    updates.status = 'full';
    updates.gameFullNotifiedAt = FieldValue.serverTimestamp();
    gameNowFull = true;
  }
  
  await sessionRef.update(updates);
  
  // Get player details for notifications
  const player = await getPlayerDetails(playerId);
  
  const playerName = player ? `${player.firstName} ${player.lastName}`.trim() : 'A player';
  const matchType = session.isDoubles ? 'Doubles' : 'Singles';
  const gameDate = session.startTimeDisplay || 'upcoming game';
  
  // Send in-app + SMS notification to organizer (via notification system)
  if (session.organizerId !== playerId) {
    try {
      await sendRsvpNotification({
        organizerId: session.organizerId,
        responderId: playerId,
        responderName: playerName,
        gameSessionId: sessionId,
        matchType,
        date: gameDate,
        accepted: true,
      });
    } catch (notifError) {
      console.error('[rsvp] Error sending RSVP notification:', notifError);
    }
  }
  
  // If game is now full, notify everyone
  if (gameNowFull) {
    await notifyGameFull(sessionId, session, playerStatuses);

    // If a waitlisted player claimed a reopened spot, notify remaining waitlist players.
    if (currentStatus === 'WAITLIST') {
      const remainingWaitlistIds = Object.entries(playerStatuses)
        .filter(([id, status]) => id !== playerId && status === 'WAITLIST')
        .map(([id]) => id);

      for (const waitlistId of remainingWaitlistIds) {
        const waitlistPlayer = await getPlayerDetails(waitlistId);
        if (waitlistPlayer?.phone) {
          const claimedMsg = "Spot has been filled. You're still on the waitlist for the next opening.";
          await sendSmsNotification(waitlistPlayer.phone, await appendStopFooter(claimedMsg));
        }
      }
    }
  }
  
  return { 
    success: true, 
    message: gameNowFull 
      ? "You're in! 🎉 Game is now full - see you there!"
      : "You're in! ✅ We'll let you know when the game is confirmed.",
    newStatus: 'CONFIRMED',
    gameStatus: gameNowFull ? 'full' : 'open'
  };
}

/**
 * Handle player declining a game invite
 */
export async function handleDecline(
  playerId: string, 
  sessionId: string
): Promise<RsvpActionResult> {
  console.log(`[rsvp] Player ${playerId} declining game ${sessionId}`);
  
  const adminDb = await getAdminDb();
  if (!adminDb) {
    return { success: false, message: 'Database not available', error: 'no_db' };
  }
  
  const sessionRef = adminDb.collection('game-sessions').doc(sessionId);
  const sessionDoc = await sessionRef.get();
  
  if (!sessionDoc.exists) {
    return { success: false, message: 'Game not found', error: 'not_found' };
  }
  
  const session = sessionDoc.data()!;
  
  // Update player status
  await sessionRef.update({
    [`playerStatuses.${playerId}`]: 'DECLINED',
  });
  
  // Notify organizer
  const player = await getPlayerDetails(playerId);
  
  const playerName = player ? `${player.firstName} ${player.lastName}`.trim() : 'A player';
  const matchType = session.isDoubles ? 'Doubles' : 'Singles';
  const gameDate = session.startTimeDisplay || 'upcoming game';
  
  // Send in-app + SMS notification to organizer (via notification system)
  if (session.organizerId !== playerId) {
    try {
      await sendRsvpNotification({
        organizerId: session.organizerId,
        responderId: playerId,
        responderName: playerName,
        gameSessionId: sessionId,
        matchType,
        date: gameDate,
        accepted: false,
      });
    } catch (notifError) {
      console.error('[rsvp] Error sending RSVP notification:', notifError);
    }
  }
  
  return { 
    success: true, 
    message: "No problem! Maybe next time. 👍",
    newStatus: 'DECLINED',
    gameStatus: session.status
  };
}

/**
 * Handle player cancelling their confirmed spot
 */
export async function handleCancel(
  playerId: string, 
  sessionId: string
): Promise<RsvpActionResult> {
  console.log(`[rsvp] Player ${playerId} cancelling game ${sessionId}`);
  
  const adminDb = await getAdminDb();
  if (!adminDb) {
    return { success: false, message: 'Database not available', error: 'no_db' };
  }
  
  const sessionRef = adminDb.collection('game-sessions').doc(sessionId);
  const sessionDoc = await sessionRef.get();
  
  if (!sessionDoc.exists) {
    return { success: false, message: 'Game not found', error: 'not_found' };
  }
  
  const session = sessionDoc.data()!;
  const currentStatus = session.playerStatuses?.[playerId];
  
  // Must be confirmed to cancel
  if (currentStatus !== 'CONFIRMED') {
    return { 
      success: false, 
      message: "You're not currently confirmed for this game.",
      error: 'not_confirmed'
    };
  }
  
  // Update status and reopen game
  const updates: any = {
    [`playerStatuses.${playerId}`]: 'CANCELLED',
  };
  
  // If game was full, reopen it
  if (session.status === 'full') {
    updates.status = 'open';
  }
  
  await sessionRef.update(updates);
  
  // Get details for notifications
  const [player, organizer] = await Promise.all([
    getPlayerDetails(playerId),
    getPlayerDetails(session.organizerId),
  ]);
  
  const playerName = player ? `${player.firstName} ${player.lastName}`.trim() : 'A player';
  
  // Notify organizer
  if (organizer?.phone && organizer.id !== playerId) {
    const organizerMsg = await generateRobinSms({
      messageType: 'player_cancelled',
      details: {
        recipientName: organizer.firstName || 'there',
        playerName,
        matchType: session.isDoubles ? 'Doubles' : 'Singles',
        date: session.startTimeDisplay || 'upcoming',
      },
    });
    await sendSmsNotification(organizer.phone, await appendStopFooter(organizerMsg));
  }
  
  // Notify other confirmed players
  const confirmedPlayerIds = Object.entries(session.playerStatuses || {})
    .filter(([id, status]) => status === 'CONFIRMED' && id !== playerId && id !== session.organizerId)
    .map(([id]) => id);
  
  for (const confirmedId of confirmedPlayerIds) {
    const confirmedPlayer = await getPlayerDetails(confirmedId);
    if (confirmedPlayer?.phone) {
      const playerMsg = await generateRobinSms({
        messageType: 'player_cancelled',
        details: {
          recipientName: confirmedPlayer.firstName || 'there',
          playerName,
          matchType: session.isDoubles ? 'Doubles' : 'Singles',
          date: session.startTimeDisplay || 'upcoming',
        },
      });
      await sendSmsNotification(confirmedPlayer.phone, await appendStopFooter(playerMsg));
    }
  }
  
  // Auto-promote the first waitlisted player, or notify pending players
  await promoteFromWaitlistOrNotify(sessionId, session, playerId);
  
  return { 
    success: true, 
    message: "Got it - you're out of this game. We've notified the others.",
    newStatus: 'CANCELLED',
    gameStatus: 'open'
  };
}

/**
 * Notify all players when a game becomes full
 */
async function notifyGameFull(
  sessionId: string, 
  session: any,
  playerStatuses: Record<string, RsvpStatus>
): Promise<void> {
  console.log(`[rsvp] Notifying everyone - game ${sessionId} is now full`);
  
  // Get all confirmed player names
  const confirmedIds = Object.entries(playerStatuses)
    .filter(([_, status]) => status === 'CONFIRMED')
    .map(([id]) => id);
  
  const confirmedPlayers = await Promise.all(confirmedIds.map(getPlayerDetails));
  const confirmedNames = confirmedPlayers
    .filter(p => p)
    .map(p => `${p!.firstName} ${p!.lastName}`.trim());

  // Notify confirmed players with Robin-voiced "game on!" message.
  // Organizer gets a milestone-style full/waitlist update.
  for (const player of confirmedPlayers) {
    if (player?.phone) {
      const gameFullMsg = player.id === session.organizerId
        ? 'Game is full, but I can put you on the waitlist.'
        : await generateRobinSms({
            messageType: 'game_full',
            details: {
              recipientName: player.firstName || 'there',
              matchType: session.isDoubles ? 'Doubles' : 'Singles',
              date: session.startTimeDisplay || 'upcoming',
              courtName: session.courtName,
              confirmedPlayers: confirmedNames,
            },
          });
      await sendSmsNotification(player.phone, await appendStopFooter(gameFullMsg));
    }
  }
  
  // Notify pending/declined players that game is full
  const otherIds = Object.entries(playerStatuses)
    .filter(([_, status]) => status === 'PENDING' || status === 'DECLINED')
    .map(([id]) => id);

  // Add remaining PENDING players to WAITLIST since game is full
  if (otherIds.length > 0) {
    const adminDb = await getAdminDb();
    if (adminDb) {
      const sessionRef = adminDb.collection('game-sessions').doc(sessionId);
      const statusUpdates: Record<string, string> = {};
      const promotedToWaitlist: string[] = [];
      for (const id of otherIds) {
        if (playerStatuses[id] === 'PENDING') {
          statusUpdates[`playerStatuses.${id}`] = 'WAITLIST';
          promotedToWaitlist.push(id);
        }
      }
      if (Object.keys(statusUpdates).length > 0) {
        await sessionRef.update({
          ...statusUpdates,
          alternates: FieldValue.arrayUnion(...promotedToWaitlist),
        });
        console.log(`[rsvp] Marked ${Object.keys(statusUpdates).length} pending players as WAITLIST (game full)`);
      }
    }
  }
  
  for (const pendingId of otherIds) {
    const player = await getPlayerDetails(pendingId);
    if (player?.phone) {
      const waitlistMsg = await generateRobinSms({
        messageType: 'spot_available_pending',
        details: {
          recipientName: player.firstName || 'there',
          date: session.startTimeDisplay || 'upcoming',
        },
      });
      await sendSmsNotification(player.phone, await appendStopFooter(waitlistMsg));
    }
  }
}

/**
 * Notify waitlisted players when a spot opens (first reply Y gets in).
 * If no one is on the waitlist, notify pending players about the opening.
 */
async function promoteFromWaitlistOrNotify(
  sessionId: string,
  session: any,
  cancelledPlayerId: string
): Promise<void> {
  console.log(`[rsvp] Checking waitlist for auto-promotion in game ${sessionId}`);
  
  const adminDb = await getAdminDb();
  if (!adminDb) return;
  
  const alternates: string[] = session.alternates || [];
  const sessionRef = adminDb.collection('game-sessions').doc(sessionId);

  // Notify all waitlist players: first person to reply Y claims the open spot.
  if (alternates.length > 0) {
    for (const waitlistId of alternates) {
      const waitlistPlayer = await getPlayerDetails(waitlistId);
      if (!waitlistPlayer?.phone) {
        continue;
      }

      const promoMsg = `Spot opened. First to reply Y is in for ${session.startTimeDisplay || 'the game'}${session.courtName ? ` at ${session.courtName}` : ''}.`;
      await sendSmsNotification(waitlistPlayer.phone, await appendStopFooter(promoMsg));

      try {
        await sendNotification({
          userId: waitlistId,
          type: 'SPOT_AVAILABLE',
          data: {
            gameSessionId: sessionId,
            matchType: session.isDoubles ? 'Doubles' : 'Singles',
            gameDate: session.startTimeDisplay,
          },
          templateData: {
            matchType: session.isDoubles ? 'Doubles' : 'Singles',
            date: session.startTimeDisplay,
            courtName: session.courtName,
          },
        });
      } catch (error) {
        console.error('[rsvp] Error sending spot-available notification:', error);
      }
    }

    console.log(`[rsvp] Notified ${alternates.length} waitlist players about the open spot (first to reply Y wins)`);

    return;
  }
  
  // No waitlisted players — notify pending players about the opening
  const playerStatuses = session.playerStatuses || {};
  const pendingIds = Object.entries(playerStatuses)
    .filter(([id, status]) => status === 'PENDING' && id !== cancelledPlayerId)
    .map(([id]) => id);
  
  for (const pendingId of pendingIds) {
    const player = await getPlayerDetails(pendingId);
    if (player?.phone) {
      await sendSmsNotification(
        player.phone,
        `🎾 Spot available! Pickleball on ${session.startTimeDisplay || 'upcoming'}. Reply Y to join or N to pass.\nReply STOP to opt out`
      );
    }
  }
}

/**
 * Send initial game invites to all players
 */
export async function sendGameInvites(
  sessionId: string,
  organizerName: string,
  courtName: string,
  dateTime: string,
  invitedPlayerIds: string[]
): Promise<{ sent: number; failed: number }> {
  console.log(`[rsvp] Sending invites for game ${sessionId} to ${invitedPlayerIds.length} players`);
  
  let sent = 0;
  let failed = 0;
  
  for (const playerId of invitedPlayerIds) {
    const player = await getPlayerDetails(playerId);
    if (!player?.phone) {
      console.log(`[rsvp] No phone for player ${playerId}`);
      failed++;
      continue;
    }
    
    const message = `🎾 ${organizerName} invited you to play pickleball!
📍 ${courtName}
📅 ${dateTime}

Reply Y to join or N to pass.
Reply STOP to opt out`;
    
    const success = await sendSmsNotification(player.phone, message);
    if (success) {
      sent++;
    } else {
      failed++;
    }
  }
  
  // Update session to track that invites were sent
  const adminDb = await getAdminDb();
  if (adminDb) {
    await adminDb.collection('game-sessions').doc(sessionId).update({
      invitesSentAt: FieldValue.serverTimestamp(),
    });
  }
  
  return { sent, failed };
}

