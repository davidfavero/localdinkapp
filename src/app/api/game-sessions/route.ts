import { NextResponse } from 'next/server';
import { z } from 'zod';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb, getLastInitError } from '@/firebase/admin';
import { normalizeToE164, sendSmsMessage, isTwilioConfigured } from '@/server/twilio';
import { sendGameInviteNotifications } from '@/lib/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AttendeeSchema = z.object({
  id: z.string().min(1),
  source: z.enum(['user', 'player']),
});

const CreateGameSessionSchema = z.object({
  courtId: z.string().min(1),
  organizerId: z.string().min(1),
  startTime: z.string().min(1),
  startTimeDisplay: z.string().min(1).optional(),
  courtName: z.string().min(1).optional(),
  courtLocation: z.string().min(1).optional(),
  isDoubles: z.boolean(),
  durationMinutes: z.number().int().positive(),
  status: z.enum(['open', 'full', 'cancelled', 'completed']).optional().default('open'),
  playerIds: z.array(z.string().min(1)),
  attendees: z.array(AttendeeSchema),
  groupIds: z.array(z.string().min(1)).optional(),
  playerStatuses: z.record(z.enum(['CONFIRMED', 'DECLINED', 'PENDING', 'CANCELLED', 'WAITLIST', 'EXPIRED'])),
  minPlayers: z.number().int().positive().optional(),
  maxPlayers: z.number().int().positive().optional(),
});

type CreateGameSessionInput = z.infer<typeof CreateGameSessionSchema>;

function formatFallback(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(date);
}

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    console.log('Received game session creation request:', JSON.stringify(raw, null, 2));
    
    const parsed = CreateGameSessionSchema.safeParse(raw);

    if (!parsed.success) {
      console.error('Validation error:', parsed.error.flatten());
      return NextResponse.json(
        { error: 'Invalid game session payload', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data: CreateGameSessionInput = parsed.data;

    const startDate = new Date(data.startTime);
    if (Number.isNaN(startDate.getTime())) {
      console.error('Invalid startTime:', data.startTime);
      return NextResponse.json(
        { error: 'Invalid startTime. Please provide an ISO 8601 formatted date string.' },
        { status: 400 }
      );
    }

    const adminDb = await getAdminDb();
    if (!adminDb) {
      const initError = getLastInitError();
      console.error('Firebase Admin DB is not available. Init error:', initError?.message);
      return NextResponse.json(
        { 
          error: 'Server configuration error: Firebase Admin is not available.',
          details: initError?.message || 'Unknown initialization error'
        },
        { status: 500 }
      );
    }

    const sessionRef = adminDb.collection('game-sessions').doc();
    
    // Calculate max/min players
    const maxPlayers = data.maxPlayers ?? (data.isDoubles ? 4 : 2);
    const minPlayers = data.minPlayers ?? maxPlayers;
    
    try {
      await sessionRef.set({
        courtId: data.courtId,
        organizerId: data.organizerId,
        startTime: Timestamp.fromDate(startDate),
        startTimeDisplay: data.startTimeDisplay ?? formatFallback(startDate),
        isDoubles: data.isDoubles,
        durationMinutes: data.durationMinutes,
        status: data.status ?? 'open',
        playerIds: data.playerIds,
        attendees: data.attendees,
        groupIds: data.groupIds ?? [],
        playerStatuses: data.playerStatuses,
        // Game limits
        minPlayers,
        maxPlayers,
        alternates: [], // Waitlist
        // Notification tracking
        invitesSentAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log('Game session created successfully:', sessionRef.id);
    } catch (error) {
      console.error('Failed to create game session document:', error);
      throw error;
    }

    const courtSnap = await adminDb.collection('courts').doc(data.courtId).get();
    const courtRecord = courtSnap.exists ? courtSnap.data() ?? {} : {};
    const resolvedCourtName =
      data.courtName ?? (typeof courtRecord?.name === 'string' ? courtRecord.name : undefined);
    const resolvedCourtLocation =
      data.courtLocation ??
      (typeof courtRecord?.location === 'string' ? courtRecord.location : undefined);

    const organizerSnap = await adminDb.collection('users').doc(data.organizerId).get();
    const organizerRecord = organizerSnap.exists ? organizerSnap.data() ?? {} : {};
    const organizerName =
      typeof organizerRecord?.firstName === 'string'
        ? `${organizerRecord.firstName}${
            organizerRecord?.lastName ? ` ${organizerRecord.lastName}` : ''
          }`.trim()
        : 'the organizer';

    const formattedStartTime = data.startTimeDisplay ?? formatFallback(startDate);
    const matchType = data.isDoubles ? 'Doubles' : 'Singles';
    const dateDisplay = startDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    const timeDisplay = startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    // Get invited player IDs (excluding organizer)
    const invitedPlayerIds = data.playerIds.filter(id => id !== data.organizerId);
    
    // Send in-app notifications to invited players
    if (invitedPlayerIds.length > 0) {
      try {
        await sendGameInviteNotifications({
          gameSessionId: sessionRef.id,
          inviterName: organizerName,
          inviterId: data.organizerId,
          inviteeIds: invitedPlayerIds,
          matchType,
          date: dateDisplay,
          time: timeDisplay,
          courtName: resolvedCourtName || 'the courts',
        });
        console.log(`In-app notifications sent to ${invitedPlayerIds.length} players`);
      } catch (notifError) {
        console.error('Error sending in-app notifications:', notifError);
        // Don't fail the request if notifications fail
      }
    }

    const smsCandidates = data.attendees.filter(
      (attendee) => attendee.id !== data.organizerId
    );

    const locationLabel = [resolvedCourtName, resolvedCourtLocation]
      .filter((segment) => typeof segment === 'string' && segment.trim().length > 0)
      .join(' • ');

    const notifiedPlayers: Array<{ playerId: string; phone: string; messageSid: string }> = [];
    const skippedPlayers: Array<{ playerId: string; reason: string }> = [];
    const seenPhones = new Set<string>();

    const twilioConfigured = isTwilioConfigured();
    if (!twilioConfigured) {
      console.warn('Twilio is not configured. SMS notifications will be skipped.');
    }

    for (const candidate of smsCandidates) {
      // Resolve against the declared source first, then fall back to the other collection.
      // This handles legacy sessions where attendee source/id pairing is inconsistent.
      const primaryCollection = candidate.source === 'user' ? 'users' : 'players';
      const fallbackCollection = primaryCollection === 'users' ? 'players' : 'users';

      let snap = await adminDb.collection(primaryCollection).doc(candidate.id).get();
      if (!snap.exists) {
        snap = await adminDb.collection(fallbackCollection).doc(candidate.id).get();
      }
      if (!snap.exists) {
        skippedPlayers.push({
          playerId: candidate.id,
          reason: `Attendee record not found in users or players`,
        });
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

      const playerName =
        (typeof playerData?.firstName === 'string' ? playerData.firstName : '') ||
        (typeof playerData?.name === 'string' ? playerData.name : 'there');

      const bodyParts = [
        `Hi ${playerName}!`,
        `You're invited to a LocalDink pickleball game${locationLabel ? ` at ${locationLabel}` : ''}.`,
        `It starts ${formattedStartTime}.`,
        `Reply YES if you can play or NO if you need to pass.`,
        `- ${organizerName}`,
      ];

      if (!twilioConfigured) {
        skippedPlayers.push({ playerId: snap.id, reason: 'Twilio is not configured' });
        continue;
      }

      const messageBody = bodyParts.join(' ');

      try {
        const message = await sendSmsMessage({ to: phone, body: messageBody });
        notifiedPlayers.push({ playerId: candidate.id, phone, messageSid: message.sid });
        console.log(`SMS sent successfully to ${phone} for attendee ${candidate.id}`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Twilio failed to send the message.';
        console.warn(`Failed to send SMS to ${phone} for attendee ${candidate.id}:`, errorMessage);
        skippedPlayers.push({ playerId: candidate.id, reason: errorMessage });
      }
    }

    try {
      await adminDb.collection('sms-attempt-logs').add({
        sessionId: sessionRef.id,
        organizerId: data.organizerId,
        notifiedCount: notifiedPlayers.length,
        notifiedPlayers,
        skippedPlayers,
        createdAt: new Date().toISOString(),
      });
    } catch (logError) {
      console.warn('Failed to write sms-attempt-logs:', logError);
    }

    return NextResponse.json({
      success: true,
      sessionId: sessionRef.id,
      notifiedCount: notifiedPlayers.length,
      notifiedPlayers,
      skippedPlayers,
    });
  } catch (error) {
    console.error('Failed to create game session via API:', error);
    if (error instanceof Error) {
      console.error('Error stack:', error.stack);
      console.error('Error message:', error.message);
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred while creating the game session.',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST to create a game session.' },
    { status: 405 }
  );
}

