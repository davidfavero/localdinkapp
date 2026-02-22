import 'server-only';

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAdminApp } from '@/firebase/admin';
import type { NotificationType, NotificationCreate, Player, NotificationPreferences } from './types';
import { DEFAULT_NOTIFICATION_PREFERENCES } from './types';

// Initialize Firestore
function getDb() {
  const app = getAdminApp();
  return getFirestore(app);
}

// ============================================
// NOTIFICATION TEMPLATES
// ============================================

interface NotificationTemplate {
  title: string;
  body: string;
  smsBody?: string;
}

type TemplateData = {
  inviterName?: string;
  inviteeName?: string;
  matchType?: string;
  date?: string;
  time?: string;
  courtName?: string;
  webLink?: string;
};

function getTemplate(type: NotificationType, data: TemplateData): NotificationTemplate {
  switch (type) {
    case 'GAME_INVITE':
      return {
        title: `Game invite from ${data.inviterName || 'a friend'}`,
        body: `${data.matchType || 'Game'} on ${data.date || 'TBD'} at ${data.time || 'TBD'} • ${data.courtName || 'TBD'}`,
        smsBody: `🏓 ${data.inviterName || 'Someone'} invited you to play ${data.matchType || 'pickleball'} on ${data.date || 'TBD'} at ${data.time || 'TBD'} at ${data.courtName || 'the courts'}. Reply Y to accept, N to decline, or tap: ${data.webLink || 'the app'}`,
      };
    
    case 'GAME_INVITE_ACCEPTED':
      return {
        title: `${data.inviteeName || 'Someone'} is in!`,
        body: `Accepted your ${data.matchType || 'game'} invite for ${data.date || 'the game'}`,
      };
    
    case 'GAME_INVITE_DECLINED':
      return {
        title: `${data.inviteeName || 'Someone'} can't make it`,
        body: `Declined your ${data.matchType || 'game'} invite for ${data.date || 'the game'}`,
      };
    
    case 'GAME_REMINDER':
      return {
        title: 'Game starting soon!',
        body: `${data.matchType || 'Your game'} in 2 hours at ${data.courtName || 'the courts'}. Still need your RSVP!`,
        smsBody: `⏰ Reminder: ${data.matchType || 'Your game'} at ${data.courtName || 'the courts'} starts in 2 hours! Tap to view: ${data.webLink || 'the app'}`,
      };
    
    case 'GAME_CHANGED':
      return {
        title: 'Game details changed',
        body: `${data.matchType || 'Your game'} on ${data.date || 'TBD'} has been updated`,
        smsBody: `📝 Game update: ${data.matchType || 'Your game'} on ${data.date || 'TBD'} has changed. Tap for details: ${data.webLink || 'the app'}`,
      };
    
    case 'GAME_CANCELLED':
      return {
        title: 'Game cancelled',
        body: `${data.matchType || 'The game'} on ${data.date || 'TBD'} at ${data.courtName || 'the courts'} has been cancelled`,
        smsBody: `❌ Cancelled: ${data.matchType || 'The game'} on ${data.date || 'TBD'} at ${data.courtName || 'the courts'} has been cancelled.`,
      };
    
    case 'SPOT_AVAILABLE':
      return {
        title: "You're in! 🎉",
        body: `A spot opened up for ${data.matchType || 'the game'} on ${data.date || 'TBD'} at ${data.courtName || 'the courts'}`,
        smsBody: `🎉 Good news! A spot opened up for ${data.matchType || 'the game'} on ${data.date || 'TBD'}. You're now confirmed! Tap: ${data.webLink || 'the app'}`,
      };
    
    case 'RSVP_EXPIRED':
      return {
        title: 'Invite expired',
        body: `The invite to ${data.matchType || 'the game'} on ${data.date || 'TBD'} has expired`,
      };
    
    default:
      return {
        title: 'Notification',
        body: 'You have a new notification',
      };
  }
}

// ============================================
// SEND NOTIFICATION
// ============================================

interface SendNotificationOptions {
  userId: string;
  type: NotificationType;
  data: {
    gameSessionId?: string;
    inviterId?: string;
    inviterName?: string;
    courtName?: string;
    gameDate?: string;
    gameTime?: string;
    matchType?: string;
  };
  templateData?: TemplateData;
}

/**
 * Send a notification to a user via their preferred channels
 */
export async function sendNotification(options: SendNotificationOptions): Promise<{ success: boolean; channels: string[] }> {
  const { userId, type, data, templateData = {} } = options;
  const db = getDb();
  
  // Get user's notification preferences and phone
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) {
    console.warn(`User ${userId} not found, skipping notification`);
    return { success: false, channels: [] };
  }
  
  const userData = userDoc.data() as Player;
  const prefs: NotificationPreferences = userData.notificationPreferences || DEFAULT_NOTIFICATION_PREFERENCES;
  
  // Check if this notification type is enabled
  const typeKey = getTypePreferenceKey(type);
  if (typeKey && !prefs.types[typeKey]) {
    console.log(`Notification type ${type} disabled for user ${userId}`);
    return { success: true, channels: [] };
  }
  
  // Get template
  const webLink = data.gameSessionId 
    ? `${process.env.NEXT_PUBLIC_APP_URL || 'https://localdink.app'}/dashboard/sessions/${data.gameSessionId}`
    : `${process.env.NEXT_PUBLIC_APP_URL || 'https://localdink.app'}/dashboard/sessions`;
  
  const template = getTemplate(type, { ...templateData, webLink });
  
  const channelsUsed: string[] = [];
  
  // Send In-App notification
  if (prefs.channels.inApp) {
    try {
      const notification: NotificationCreate = {
        userId,
        type,
        title: template.title,
        body: template.body,
        data,
        read: false,
        channels: ['inApp'],
      };
      
      await db.collection('notifications').add({
        ...notification,
        createdAt: FieldValue.serverTimestamp(),
      });
      
      channelsUsed.push('inApp');
      console.log(`In-app notification sent to user ${userId}`);
    } catch (error) {
      console.error('Error sending in-app notification:', error);
    }
  }
  
  // Send SMS notification when user enabled SMS and Twilio is configured
  if (prefs.channels.sms && template.smsBody && userData.phone) {
    try {
      // Dynamic import to avoid issues when Twilio isn't configured
      const { sendSmsMessage, normalizeToE164, isTwilioConfigured } = await import('@/server/twilio');
      
      if (!isTwilioConfigured()) {
        console.warn('Twilio not configured, skipping SMS');
      } else {
        const normalizedPhone = normalizeToE164(userData.phone);
        if (normalizedPhone) {
          await sendSmsMessage({
            to: normalizedPhone,
            body: template.smsBody,
          });
          channelsUsed.push('sms');
          console.log(`SMS notification sent to ${normalizedPhone}`);
        } else {
          console.warn(`Invalid phone number for user ${userId}: ${userData.phone}`);
        }
      }
    } catch (error) {
      console.error('Error sending SMS notification:', error);
    }
  }
  
  return { success: true, channels: channelsUsed };
}

/**
 * Map notification type to preference key
 */
function getTypePreferenceKey(type: NotificationType): keyof NotificationPreferences['types'] | null {
  switch (type) {
    case 'GAME_INVITE':
      return 'gameInvites';
    case 'GAME_INVITE_ACCEPTED':
    case 'GAME_INVITE_DECLINED':
      return 'rsvpUpdates';
    case 'GAME_REMINDER':
      return 'gameReminders';
    case 'GAME_CHANGED':
    case 'GAME_CANCELLED':
      return 'gameChanges';
    case 'SPOT_AVAILABLE':
      return 'spotAvailable';
    case 'RSVP_EXPIRED':
      return 'gameInvites';
    default:
      return null;
  }
}

// ============================================
// BATCH NOTIFICATIONS
// ============================================

/**
 * Send notifications to multiple users (e.g., all invitees of a game)
 */
export async function sendNotificationToMany(
  userIds: string[],
  type: NotificationType,
  data: SendNotificationOptions['data'],
  templateData?: TemplateData
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  
  for (const userId of userIds) {
    try {
      const result = await sendNotification({ userId, type, data, templateData });
      if (result.success && result.channels.length > 0) {
        sent++;
      } else if (!result.success) {
        failed++;
      }
    } catch (error) {
      console.error(`Failed to send notification to user ${userId}:`, error);
      failed++;
    }
  }
  
  return { sent, failed };
}

// ============================================
// SPECIFIC NOTIFICATION HELPERS
// ============================================

/**
 * Send game invite notifications to all invitees
 */
export async function sendGameInviteNotifications(params: {
  gameSessionId: string;
  inviterName: string;
  inviterId: string;
  inviteeIds: string[];
  matchType: string;
  date: string;
  time: string;
  courtName: string;
}): Promise<void> {
  const { gameSessionId, inviterName, inviterId, inviteeIds, matchType, date, time, courtName } = params;
  
  await sendNotificationToMany(
    inviteeIds,
    'GAME_INVITE',
    {
      gameSessionId,
      inviterId,
      inviterName,
      courtName,
      gameDate: date,
      gameTime: time,
      matchType,
    },
    {
      inviterName,
      matchType,
      date,
      time,
      courtName,
    }
  );
}

/**
 * Send RSVP response notification to organizer
 */
export async function sendRsvpNotification(params: {
  organizerId: string;
  responderId: string;
  responderName: string;
  gameSessionId: string;
  matchType: string;
  date: string;
  accepted: boolean;
}): Promise<void> {
  const { organizerId, responderId, responderName, gameSessionId, matchType, date, accepted } = params;
  
  await sendNotification({
    userId: organizerId,
    type: accepted ? 'GAME_INVITE_ACCEPTED' : 'GAME_INVITE_DECLINED',
    data: {
      gameSessionId,
      inviterId: responderId,
      inviterName: responderName,
      matchType,
      gameDate: date,
    },
    templateData: {
      inviteeName: responderName,
      matchType,
      date,
    },
  });
}

