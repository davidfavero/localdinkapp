/**
 * @fileOverview A tool for creating game sessions using the admin SDK directly.
 * Uses Firestore admin instead of the HTTP API to avoid cookie-based auth issues
 * when called from server-side Genkit flows.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { getAdminDb } from '@/firebase/admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { normalizeToE164, sendSmsMessage, isTelnyxConfigured } from '@/server/telnyx';
import { sendGameInviteNotifications } from '@/lib/notifications';

const CreateGameSessionToolSchema = z.object({
  courtId: z.string().describe('The ID of the court where the game will be played.'),
  organizerId: z.string().describe('The user ID of the person organizing the game.'),
  startTime: z.string().describe('ISO 8601 formatted date-time string for when the game starts.'),
  isDoubles: z.boolean().describe('Whether this is a doubles game (true) or singles (false).'),
  playerIds: z.array(z.string()).describe('Array of user/player IDs to invite to the game.'),
  attendees: z.array(z.object({
    id: z.string(),
    source: z.enum(['user', 'player']),
  })).describe('Array of attendees with their source (user or player).'),
  playerStatuses: z.record(z.enum(['CONFIRMED', 'DECLINED', 'PENDING'])).describe('Initial RSVP status for each player.'),
  durationMinutes: z.number().optional().describe('Duration of the game in minutes. Defaults to 120.'),
});

export const createGameSessionTool = ai.defineTool(
  {
    name: 'createGameSessionTool',
    description: 'Creates a new pickleball game session and sends SMS invitations to players. Use this when the user confirms they want to schedule a game with all the details (players, date, time, location).',
    inputSchema: CreateGameSessionToolSchema,
    outputSchema: z.object({
      success: z.boolean(),
      sessionId: z.string().optional(),
      notifiedCount: z.number().optional(),
      skippedPlayers: z.array(
        z.object({
          playerId: z.string(),
          reason: z.string(),
        })
      ).optional(),
      error: z.string().optional(),
    }),
  },
  async (input) => {
    try {
      const adminDb = await getAdminDb();
      if (!adminDb) {
        return { success: false, error: 'Firebase Admin DB is not available.' };
      }

      const startDate = new Date(input.startTime);
      if (Number.isNaN(startDate.getTime())) {
        return { success: false, error: 'Invalid startTime.' };
      }

      const durationMinutes = input.durationMinutes || 120;
      const maxPlayers = input.isDoubles ? 4 : 2;
      const startTimeDisplay = new Intl.DateTimeFormat('en-US', {
        dateStyle: 'full',
        timeStyle: 'short',
      }).format(startDate);

      // Create the game session document
      const sessionRef = adminDb.collection('game-sessions').doc();
      await sessionRef.set({
        courtId: input.courtId,
        organizerId: input.organizerId,
        startTime: Timestamp.fromDate(startDate),
        startTimeDisplay,
        isDoubles: input.isDoubles,
        durationMinutes,
        status: 'open',
        playerIds: input.playerIds,
        attendees: input.attendees,
        groupIds: [],
        playerStatuses: input.playerStatuses,
        minPlayers: maxPlayers,
        maxPlayers,
        alternates: [],
        invitesSentAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Look up court and organizer info for notifications
      const courtSnap = await adminDb.collection('courts').doc(input.courtId).get();
      const courtRecord = courtSnap.exists ? courtSnap.data() ?? {} : {};
      const courtName = typeof courtRecord?.name === 'string' ? courtRecord.name : undefined;
      const courtLocation = typeof courtRecord?.location === 'string' ? courtRecord.location : undefined;

      const organizerSnap = await adminDb.collection('users').doc(input.organizerId).get();
      const organizerRecord = organizerSnap.exists ? organizerSnap.data() ?? {} : {};
      const organizerName = typeof organizerRecord?.firstName === 'string'
        ? `${organizerRecord.firstName}${organizerRecord?.lastName ? ` ${organizerRecord.lastName}` : ''}`.trim()
        : 'the organizer';

      const matchType = input.isDoubles ? 'Doubles' : 'Singles';
      const dateDisplay = startDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      const timeDisplay = startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

      // Send in-app notifications
      const invitedPlayerIds = input.playerIds.filter(id => id !== input.organizerId);
      if (invitedPlayerIds.length > 0) {
        try {
          await sendGameInviteNotifications({
            gameSessionId: sessionRef.id,
            inviterName: organizerName,
            inviterId: input.organizerId,
            inviteeIds: invitedPlayerIds,
            matchType,
            date: dateDisplay,
            time: timeDisplay,
            courtName: courtName || 'the courts',
          });
        } catch (notifError) {
          console.error('Error sending in-app notifications:', notifError);
        }
      }

      // Send SMS invitations
      const smsCandidates = input.attendees.filter(a => a.id !== input.organizerId);
      const locationLabel = [courtName, courtLocation]
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        .join(' • ');

      const notifiedPlayers: Array<{ playerId: string; phone: string; messageSid: string }> = [];
      const skippedPlayers: Array<{ playerId: string; reason: string }> = [];
      const seenPhones = new Set<string>();
      const smsConfigured = isTelnyxConfigured();

      for (const candidate of smsCandidates) {
        const primaryCollection = candidate.source === 'user' ? 'users' : 'players';
        const fallbackCollection = primaryCollection === 'users' ? 'players' : 'users';

        let snap = await adminDb.collection(primaryCollection).doc(candidate.id).get();
        if (!snap.exists) {
          snap = await adminDb.collection(fallbackCollection).doc(candidate.id).get();
        }
        if (!snap.exists) {
          skippedPlayers.push({ playerId: candidate.id, reason: 'Attendee record not found' });
          continue;
        }

        const playerData = snap.data() as Record<string, any>;
        const phone = normalizeToE164(playerData?.phone);
        if (!phone) {
          skippedPlayers.push({ playerId: candidate.id, reason: 'Missing or invalid phone number' });
          continue;
        }
        if (seenPhones.has(phone)) {
          skippedPlayers.push({ playerId: candidate.id, reason: 'Duplicate phone number' });
          continue;
        }
        seenPhones.add(phone);

        const playerName = (typeof playerData?.firstName === 'string' ? playerData.firstName : '') || 'there';
        const bodyParts = [
          `Hi ${playerName}!`,
          `You're invited to a LocalDink pickleball game${locationLabel ? ` at ${locationLabel}` : ''}.`,
          `It starts ${startTimeDisplay}.`,
          `Reply YES if you can play or NO if you need to pass.`,
          `- ${organizerName}`,
          `Reply STOP to opt out`,
        ];

        if (!smsConfigured) {
          skippedPlayers.push({ playerId: snap.id, reason: 'Telnyx is not configured' });
          continue;
        }

        try {
          const message = await sendSmsMessage({ to: phone, body: bodyParts.join(' ') });
          notifiedPlayers.push({ playerId: candidate.id, phone, messageSid: message?.id ?? 'unknown' });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'SMS send failed';
          skippedPlayers.push({ playerId: candidate.id, reason: errorMessage });
        }
      }

      // Log SMS attempts
      try {
        await adminDb.collection('sms-attempt-logs').add({
          sessionId: sessionRef.id,
          organizerId: input.organizerId,
          notifiedCount: notifiedPlayers.length,
          notifiedPlayers,
          skippedPlayers,
          createdAt: new Date().toISOString(),
        });
      } catch (logError) {
        console.warn('Failed to write sms-attempt-logs:', logError);
      }

      return {
        success: true,
        sessionId: sessionRef.id,
        notifiedCount: notifiedPlayers.length,
        skippedPlayers,
      };
    } catch (error: any) {
      console.error('Failed to create game session:', error);
      return {
        success: false,
        error: error.message || 'Failed to create game session',
      };
    }
  }
);

