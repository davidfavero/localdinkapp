'use server';

/**
 * @fileOverview SMS/TCPA compliance utilities.
 * Handles STOP opt-out, HELP responses, opt-in confirmation,
 * and consent audit trail.
 */

import { getAdminDb } from '@/firebase/admin';
import { normalizeToE164, sendSmsMessage, isTelnyxConfigured } from '@/server/telnyx';
import { FieldValue } from 'firebase-admin/firestore';

// ============================================
// COMPLIANCE CONSTANTS
// ============================================

const PROGRAM_NAME = 'LocalDink Alerts';
const SUPPORT_EMAIL = 'support@localdink.com';

const STOP_CONFIRMATION =
  `You have been unsubscribed from ${PROGRAM_NAME}. You will no longer receive SMS messages. Reply HELP for help or re-enable SMS in the LocalDink app.`;

const HELP_RESPONSE =
  `${PROGRAM_NAME}: Game scheduling via SMS. Msg frequency varies. Msg&data rates may apply. Reply STOP to cancel. For help visit localdink.com or email ${SUPPORT_EMAIL}.`;

const OPT_IN_CONFIRMATION =
  `${PROGRAM_NAME}: You're now enrolled for game invite texts. Msg frequency varies. Msg&data rates may apply. Reply HELP for help, STOP to cancel.`;

/** Standard footer appended to outbound SMS messages. */
const SMS_OPT_OUT_FOOTER = '\nReply STOP to opt out';

// ============================================
// STOP HANDLER
// ============================================

/**
 * Process an inbound STOP keyword.
 * Finds the user/player by phone and sets sms=false + records timestamp.
 */
export async function handleSmsOptOut(phone: string): Promise<{ success: boolean; message: string }> {
  const normalized = normalizeToE164(phone);
  if (!normalized) {
    return { success: false, message: STOP_CONFIRMATION };
  }

  const adminDb = await getAdminDb();
  if (!adminDb) {
    // Even if DB is unavailable, still confirm opt-out to the user (TCPA requires it)
    return { success: false, message: STOP_CONFIRMATION };
  }

  // Search users and players collections for this phone
  const collections = ['users', 'players'] as const;
  for (const collectionName of collections) {
    const snap = await adminDb
      .collection(collectionName)
      .where('phone', '==', normalized)
      .get();

    for (const doc of snap.docs) {
      await doc.ref.update({
        'notificationPreferences.channels.sms': false,
        smsOptOutAt: FieldValue.serverTimestamp(),
        smsOptOutSource: 'STOP_keyword',
      });
    }
  }

  // Also try without the +1 prefix for legacy data
  const digitsOnly = normalized.replace(/\D/g, '');
  const candidatePhones = [normalized];
  if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    candidatePhones.push(digitsOnly.slice(1)); // 10-digit
    candidatePhones.push(`+${digitsOnly}`);
  }
  if (digitsOnly.length === 10) {
    candidatePhones.push(`+1${digitsOnly}`);
    candidatePhones.push(digitsOnly);
  }

  for (const collectionName of collections) {
    for (const candidate of candidatePhones) {
      if (candidate === normalized) continue; // Already handled above
      const snap = await adminDb
        .collection(collectionName)
        .where('phone', '==', candidate)
        .get();
      for (const doc of snap.docs) {
        await doc.ref.update({
          'notificationPreferences.channels.sms': false,
          smsOptOutAt: FieldValue.serverTimestamp(),
          smsOptOutSource: 'STOP_keyword',
        });
      }
    }
  }

  console.log(`[sms-compliance] Processed STOP for ${normalized}`);
  return { success: true, message: STOP_CONFIRMATION };
}

// ============================================
// HELP HANDLER
// ============================================

/**
 * Process an inbound HELP keyword.
 * Returns program info, support contact, and opt-out instructions.
 */
export async function handleSmsHelp(_phone: string): Promise<{ success: boolean; message: string }> {
  return { success: true, message: HELP_RESPONSE };
}

// ============================================
// OPT-IN CONFIRMATION
// ============================================

/**
 * Send the required opt-in confirmation SMS when a user enables SMS.
 * Records consent timestamp for audit trail.
 */
export async function sendOptInConfirmation(userId: string, phone: string): Promise<boolean> {
  const normalized = normalizeToE164(phone);
  if (!normalized || !isTelnyxConfigured()) {
    return false;
  }

  try {
    await sendSmsMessage({ to: normalized, body: OPT_IN_CONFIRMATION });

    // Record consent timestamp
    const adminDb = await getAdminDb();
    if (adminDb) {
      await adminDb.collection('users').doc(userId).update({
        smsConsentAt: FieldValue.serverTimestamp(),
        smsConsentSource: 'in_app_toggle',
      });
    }

    console.log(`[sms-compliance] Opt-in confirmation sent to ${normalized}`);
    return true;
  } catch (error) {
    console.error('[sms-compliance] Failed to send opt-in confirmation:', error);
    return false;
  }
}
