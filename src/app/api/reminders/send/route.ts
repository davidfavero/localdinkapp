/**
 * @fileOverview Game Reminder SMS API
 *
 * Sends two reminders per game session:
 * 1. Evening before (7:00 PM ET the night before the game)
 * 2. One hour before game time
 *
 * Designed to be called by a cron job every 15 minutes.
 * Protected by CRON_SECRET to prevent unauthorized access.
 *
 * Reminder tracking fields on game-session docs:
 * - eveningReminderSentAt: Timestamp when evening-before reminder was sent
 * - hourBeforeReminderSentAt: Timestamp when 1-hour-before reminder was sent
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/firebase/admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { normalizeToE164, sendSmsMessage, isTwilioConfigured } from '@/server/twilio';
import { generateRobinSms, appendStopFooter } from '@/ai/flows/robin-sms';

const APP_TIME_ZONE = 'America/New_York';

/** Cron secret — must match the value in Cloud Scheduler / external cron */
const CRON_SECRET = process.env.CRON_SECRET || '';

export async function GET(request: NextRequest) {
  // Authenticate cron requests
  const authHeader = request.headers.get('authorization');
  const urlSecret = request.nextUrl.searchParams.get('secret');
  const providedSecret = authHeader?.replace('Bearer ', '') || urlSecret;

  if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminDb = await getAdminDb();
  if (!adminDb) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  if (!isTwilioConfigured()) {
    return NextResponse.json({ error: 'Twilio not configured' }, { status: 500 });
  }

  const now = new Date();
  const results = { eveningReminders: 0, hourReminders: 0, errors: 0 };

  try {
    // ================================================================
    // EVENING-BEFORE REMINDERS (7:00 PM ET the night before)
    // ================================================================
    // Find games starting tomorrow that haven't had evening reminders sent.
    // "Tomorrow" means: games with startTime between tonight midnight and
    // tomorrow midnight (ET). We send these when the current ET time is
    // between 7:00 PM and 11:59 PM.
    const nowET = new Date(now.toLocaleString('en-US', { timeZone: APP_TIME_ZONE }));
    const currentHourET = nowET.getHours();

    if (currentHourET >= 19) {
      // It's 7 PM or later ET — check for games tomorrow
      const tomorrowStart = new Date(nowET);
      tomorrowStart.setDate(tomorrowStart.getDate() + 1);
      tomorrowStart.setHours(0, 0, 0, 0);

      const tomorrowEnd = new Date(tomorrowStart);
      tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

      // Convert back to UTC for Firestore query
      const tomorrowStartUTC = toUTCFromET(tomorrowStart);
      const tomorrowEndUTC = toUTCFromET(tomorrowEnd);

      const eveningSnap = await adminDb
        .collection('game-sessions')
        .where('startTime', '>=', Timestamp.fromDate(tomorrowStartUTC))
        .where('startTime', '<', Timestamp.fromDate(tomorrowEndUTC))
        .where('status', 'in', ['open', 'full'])
        .get();

      for (const doc of eveningSnap.docs) {
        const session = doc.data();
        // Skip if already sent
        if (session.eveningReminderSentAt) continue;

        const sent = await sendRemindersForSession(adminDb, doc.id, session, 'evening');
        results.eveningReminders += sent;

        // Mark as sent
        await doc.ref.update({ eveningReminderSentAt: FieldValue.serverTimestamp() });
      }
    }

    // ================================================================
    // ONE-HOUR-BEFORE REMINDERS
    // ================================================================
    // Find games starting in the next 60-75 minutes (to account for
    // 15-minute cron intervals) that haven't had hour-before reminders.
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    const bufferEnd = new Date(now.getTime() + 75 * 60 * 1000);

    const hourSnap = await adminDb
      .collection('game-sessions')
      .where('startTime', '>=', Timestamp.fromDate(oneHourFromNow))
      .where('startTime', '<=', Timestamp.fromDate(bufferEnd))
      .where('status', 'in', ['open', 'full'])
      .get();

    for (const doc of hourSnap.docs) {
      const session = doc.data();
      // Skip if already sent
      if (session.hourBeforeReminderSentAt) continue;

      const sent = await sendRemindersForSession(adminDb, doc.id, session, 'hour_before');
      results.hourReminders += sent;

      // Mark as sent
      await doc.ref.update({ hourBeforeReminderSentAt: FieldValue.serverTimestamp() });
    }

    console.log('[reminders] Completed:', results);
    return NextResponse.json({ success: true, ...results });
  } catch (error) {
    console.error('[reminders] Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Convert ET local time to UTC Date for Firestore queries.
 */
function toUTCFromET(etDate: Date): Date {
  // Create a date string in ET, then parse as UTC offset
  const etString = etDate.toLocaleString('en-US', { timeZone: APP_TIME_ZONE });
  const utcString = etDate.toLocaleString('en-US', { timeZone: 'UTC' });
  const diff = new Date(utcString).getTime() - new Date(etString).getTime();
  return new Date(etDate.getTime() + diff);
}

/**
 * Send reminder SMS to all confirmed/pending players in a game session.
 */
async function sendRemindersForSession(
  adminDb: FirebaseFirestore.Firestore,
  sessionId: string,
  session: Record<string, any>,
  reminderType: 'evening' | 'hour_before',
): Promise<number> {
  const playerStatuses: Record<string, string> = session.playerStatuses || {};
  const attendees: { id: string; source: string }[] = session.attendees || [];
  const organizerId: string = session.organizerId || '';

  // Only remind CONFIRMED and PENDING players (not declined/cancelled/waitlisted)
  const playersToRemind = attendees.filter(a => {
    const status = playerStatuses[a.id];
    return status === 'CONFIRMED' || status === 'PENDING';
  });

  // Include organizer (always confirmed)
  const organizerIncluded = playersToRemind.some(p => p.id === organizerId);
  if (!organizerIncluded && organizerId) {
    playersToRemind.push({ id: organizerId, source: 'user' });
  }

  // Format game details for the reminder
  const startTime = session.startTime?.toDate?.() || new Date();
  const matchType = session.isDoubles ? 'Doubles' : 'Singles';
  const dateDisplay = startTime.toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric', timeZone: APP_TIME_ZONE,
  });
  const timeDisplay = startTime.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: APP_TIME_ZONE,
  });
  const courtName = session.courtName || 'the courts';
  const courtLocation = session.courtLocation || undefined;

  // Collect confirmed player names for context
  const confirmedNames: string[] = [];
  for (const a of attendees) {
    if (playerStatuses[a.id] === 'CONFIRMED') {
      const collection = a.source === 'user' ? 'users' : 'players';
      const snap = await adminDb.collection(collection).doc(a.id).get();
      if (snap.exists) {
        const d = snap.data()!;
        confirmedNames.push((`${d.firstName || ''} ${d.lastName || ''}`).trim());
      }
    }
  }

  let sentCount = 0;
  const seenPhones = new Set<string>();

  for (const attendee of playersToRemind) {
    try {
      const primaryColl = attendee.source === 'user' ? 'users' : 'players';
      const fallbackColl = primaryColl === 'users' ? 'players' : 'users';

      let snap = await adminDb.collection(primaryColl).doc(attendee.id).get();
      if (!snap.exists) snap = await adminDb.collection(fallbackColl).doc(attendee.id).get();
      if (!snap.exists) continue;

      const playerData = snap.data()!;
      const phone = normalizeToE164(playerData.phone);
      if (!phone || seenPhones.has(phone)) continue;
      seenPhones.add(phone);

      const playerName = (playerData.firstName || 'there');

      const smsBody = await generateRobinSms({
        messageType: 'game_reminder',
        details: {
          recipientName: playerName,
          matchType,
          date: reminderType === 'evening' ? `tomorrow, ${dateDisplay}` : dateDisplay,
          time: timeDisplay,
          courtName,
          courtLocation,
          confirmedPlayers: confirmedNames,
          confirmedCount: confirmedNames.length,
        },
      });

      const finalBody = await appendStopFooter(smsBody);
      await sendSmsMessage({ to: phone, body: finalBody });
      sentCount++;
      console.log(`[reminders] Sent ${reminderType} reminder to ${playerName} (${phone}) for session ${sessionId}`);
    } catch (err) {
      console.error(`[reminders] Failed to send to ${attendee.id}:`, err);
    }
  }

  return sentCount;
}
