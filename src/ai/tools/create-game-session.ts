/**
 * @fileOverview A tool for creating game sessions using the admin SDK directly.
 * Uses Firestore admin instead of the HTTP API to avoid cookie-based auth issues
 * when called from server-side Genkit flows.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { getAdminDb } from '@/firebase/admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { normalizeToE164, sendSmsMessage, isTwilioConfigured } from '@/server/twilio';
import { sendGameInviteNotifications } from '@/lib/notifications';
import { generateRobinSms, appendStopFooter } from '@/ai/flows/robin-sms';

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
  recurring: z.object({
    enabled: z.boolean(),
    frequency: z.enum(['weekly', 'biweekly']),
  }).optional().describe('Whether this is a recurring game (e.g. every week or every two weeks).'),
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
        timeZone: 'America/New_York',
      }).format(startDate);

      // Create the game session document
      const sessionRef = adminDb.collection('game-sessions').doc();
      const sessionData: Record<string, any> = {
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
      };

      // Add recurring info if specified
      if (input.recurring?.enabled) {
        sessionData.recurring = {
          enabled: true,
          frequency: input.recurring.frequency,
          dayOfWeek: startDate.getDay(),
        };
      }

      await sessionRef.set(sessionData);

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
      const dateDisplay = startDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'America/New_York' });
      const timeDisplay = startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });

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

      const notifiedPlayers: Array<{ playerId: string; phone: string; messageSid: string }> = [];
      const skippedPlayers: Array<{ playerId: string; reason: string }> = [];
      const seenPhones = new Set<string>();
      const smsConfigured = isTwilioConfigured();

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
        const isRegisteredUser = candidate.source === 'user' || !!playerData?.linkedUserId;

        // Generate Robin-voiced game invite SMS
        const smsBody = await generateRobinSms({
          messageType: 'game_invite',
          details: {
            recipientName: playerName,
            organizerName,
            matchType,
            date: dateDisplay,
            time: timeDisplay,
            courtName: courtName || 'the courts',
            courtLocation: courtLocation || undefined,
          },
          isFirstContact: !isRegisteredUser,
        });

        if (!smsConfigured) {
          skippedPlayers.push({ playerId: snap.id, reason: 'Twilio is not configured' });
          continue;
        }

        try {
          const message = await sendSmsMessage({ to: phone, body: await appendStopFooter(smsBody) });
          notifiedPlayers.push({ playerId: candidate.id, phone, messageSid: message?.sid ?? 'unknown' });
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

