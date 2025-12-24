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
  
  const normalizedPhone = normalizeToE164(phone);
  if (!normalizedPhone) return null;
  
  // Check users collection
  const usersSnap = await adminDb.collection('users')
    .where('phone', '==', normalizedPhone)
    .limit(1)
    .get();
  
  if (!usersSnap.empty) {
    const doc = usersSnap.docs[0];
    return { id: doc.id, ...doc.data() } as Player & { id: string };
  }
  
  // Check players collection
  const playersSnap = await adminDb.collection('players')
    .where('phone', '==', normalizedPhone)
    .limit(1)
    .get();
  
  if (!playersSnap.empty) {
    const doc = playersSnap.docs[0];
    return { id: doc.id, ...doc.data() } as Player & { id: string };
  }
  
  return null;
}

/**
 * Find the most recent pending game invite for a player
 */
export async function findPendingGameForPlayer(playerId: string): Promise<{ id: string; [key: string]: any } | null> {
  const adminDb = await getAdminDb();
  if (!adminDb) return null;
  
  // Find games where this player has PENDING status
  const gamesSnap = await adminDb.collection('game-sessions')
    .where('playerIds', 'array-contains', playerId)
    .where('status', 'in', ['open', 'full'])
    .orderBy('startTime', 'desc')
    .limit(10)
    .get();
  
  // Find the most recent one where player is PENDING
  for (const doc of gamesSnap.docs) {
    const data = doc.data();
    const playerStatus = data.playerStatuses?.[playerId];
    if (playerStatus === 'PENDING') {
      return { id: doc.id, ...data };
    }
  }
  
  return null;
}

/**
 * Find a confirmed game for a player (for cancellation)
 */
export async function findConfirmedGameForPlayer(playerId: string): Promise<{ id: string; [key: string]: any } | null> {
  const adminDb = await getAdminDb();
  if (!adminDb) return null;
  
  const gamesSnap = await adminDb.collection('game-sessions')
    .where('playerIds', 'array-contains', playerId)
    .where('status', 'in', ['open', 'full'])
    .orderBy('startTime', 'asc')  // Nearest upcoming game
    .limit(10)
    .get();
  
  for (const doc of gamesSnap.docs) {
    const data = doc.data();
    const playerStatus = data.playerStatuses?.[playerId];
    if (playerStatus === 'CONFIRMED') {
      return { id: doc.id, ...data };
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
  
  // Get player and organizer details for notifications
  const [player, organizer] = await Promise.all([
    getPlayerDetails(playerId),
    getPlayerDetails(session.organizerId),
  ]);
  
  const playerName = player ? `${player.firstName} ${player.lastName}`.trim() : 'A player';
  const matchType = session.isDoubles ? 'Doubles' : 'Singles';
  const gameDate = session.startTimeDisplay || 'upcoming game';
  
  // Send in-app notification to organizer
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
      console.error('[rsvp] Error sending in-app notification:', notifError);
    }
  }
  
  // Legacy SMS notification to organizer (keeping for now)
  if (organizer?.phone && organizer.id !== playerId) {
    await sendSmsNotification(
      organizer.phone, 
      `✅ ${playerName} confirmed for your pickleball game on ${session.startTimeDisplay || 'upcoming'}!`
    );
  }
  
  // If game is now full, notify everyone
  if (gameNowFull) {
    await notifyGameFull(sessionId, session, playerStatuses);
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
  const [player, organizer] = await Promise.all([
    getPlayerDetails(playerId),
    getPlayerDetails(session.organizerId),
  ]);
  
  const playerName = player ? `${player.firstName} ${player.lastName}`.trim() : 'A player';
  const matchType = session.isDoubles ? 'Doubles' : 'Singles';
  const gameDate = session.startTimeDisplay || 'upcoming game';
  
  // Send in-app notification to organizer
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
      console.error('[rsvp] Error sending in-app notification:', notifError);
    }
  }
  
  // Legacy SMS notification
  if (organizer?.phone && organizer.id !== playerId) {
    await sendSmsNotification(
      organizer.phone, 
      `${playerName} can't make your pickleball game on ${session.startTimeDisplay || 'upcoming'}.`
    );
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
    await sendSmsNotification(
      organizer.phone, 
      `⚠️ ${playerName} cancelled for your pickleball game on ${session.startTimeDisplay || 'upcoming'}. Spot reopened!`
    );
  }
  
  // Notify other confirmed players
  const confirmedPlayerIds = Object.entries(session.playerStatuses || {})
    .filter(([id, status]) => status === 'CONFIRMED' && id !== playerId && id !== session.organizerId)
    .map(([id]) => id);
  
  for (const confirmedId of confirmedPlayerIds) {
    const confirmedPlayer = await getPlayerDetails(confirmedId);
    if (confirmedPlayer?.phone) {
      await sendSmsNotification(
        confirmedPlayer.phone,
        `${playerName} dropped out of the pickleball game. Looking for a replacement!`
      );
    }
  }
  
  // Notify waitlisted/pending players about the opening
  await notifySpotOpened(sessionId, session, playerId);
  
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
    .map(p => `${p!.firstName} ${p!.lastName}`.trim())
    .join(', ');
  
  const gameFullMessage = `🎉 Game on! Your pickleball game is confirmed.
📍 ${session.courtName || 'Court'}
📅 ${session.startTimeDisplay || 'Check the app for time'}
👥 Players: ${confirmedNames}

Reply CANCEL if you can no longer make it.`;

  // Notify confirmed players
  for (const player of confirmedPlayers) {
    if (player?.phone) {
      await sendSmsNotification(player.phone, gameFullMessage);
    }
  }
  
  // Notify pending/declined players that game is full
  const otherIds = Object.entries(playerStatuses)
    .filter(([_, status]) => status === 'PENDING' || status === 'DECLINED')
    .map(([id]) => id);
  
  for (const playerId of otherIds) {
    const player = await getPlayerDetails(playerId);
    if (player?.phone) {
      await sendSmsNotification(
        player.phone,
        `The pickleball game on ${session.startTimeDisplay || 'upcoming'} is now full. We'll let you know if a spot opens!`
      );
    }
  }
}

/**
 * Notify waitlisted and pending players when a spot opens
 */
async function notifySpotOpened(
  sessionId: string,
  session: any,
  cancelledPlayerId: string
): Promise<void> {
  console.log(`[rsvp] Notifying waitlist/pending - spot opened in game ${sessionId}`);
  
  const playerStatuses = session.playerStatuses || {};
  
  // First notify waitlisted players (in order)
  const alternates = session.alternates || [];
  for (const waitlistId of alternates) {
    const player = await getPlayerDetails(waitlistId);
    if (player?.phone) {
      await sendSmsNotification(
        player.phone,
        `🏓 A spot just opened up! Pickleball on ${session.startTimeDisplay || 'upcoming'}. Reply YES to claim it!`
      );
    }
  }
  
  // Then notify pending players
  const pendingIds = Object.entries(playerStatuses)
    .filter(([id, status]) => status === 'PENDING' && id !== cancelledPlayerId)
    .map(([id]) => id);
  
  for (const pendingId of pendingIds) {
    const player = await getPlayerDetails(pendingId);
    if (player?.phone) {
      await sendSmsNotification(
        player.phone,
        `🏓 Spot available! Pickleball on ${session.startTimeDisplay || 'upcoming'}. Reply YES to join!`
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
    
    const message = `🏓 ${organizerName} invited you to play pickleball!
📍 ${courtName}
📅 ${dateTime}

Reply YES to join or NO to decline.`;
    
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

