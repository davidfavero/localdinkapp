import { NextRequest, NextResponse } from 'next/server';
import { detectSmsIntent } from '@/ai/flows/sms-intent-detection';
import { detectComplianceKeyword } from '@/ai/flows/sms-intent-detection';
import { 
  getPlayerByPhone, 
  findPendingGameForPlayer, 
  findConfirmedGameForPlayer,
  handleAccept,
  handleDecline,
  handleCancel,
} from '@/lib/rsvp-handler';
import { handleSmsOptOut, handleSmsHelp } from '@/lib/sms-compliance';
import { sendSmsMessage, normalizeToE164 } from '@/server/twilio';
import { getAdminDb } from '@/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import crypto from 'crypto';

// Twilio webhook signature validation
function validateTwilioRequest(req: NextRequest, rawBody: string): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const signature = req.headers.get('x-twilio-signature');
  
  if (!authToken) {
    console.warn('[sms-inbound] Missing TWILIO_AUTH_TOKEN');
    return process.env.NODE_ENV !== 'production';
  }

  if (!signature) {
    console.warn('[sms-inbound] Missing x-twilio-signature header');
    return process.env.NODE_ENV !== 'production';
  }
  
  // Use the public URL that Twilio signs against, not req.url which may be
  // an internal proxy URL (e.g. http://localhost:8080/...) behind App Hosting.
  // Fall back to x-forwarded-host or req.url if header is missing.
  const forwardedProto = req.headers.get('x-forwarded-proto') || 'https';
  const forwardedHost = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
  const pathname = new URL(req.url).pathname;
  const publicUrl = forwardedHost
    ? `${forwardedProto}://${forwardedHost}${pathname}`
    : req.url;
  
  const params = Object.fromEntries(new URLSearchParams(rawBody));

  // Rebuild the data string: URL + sorted params concatenated
  const data = publicUrl + Object.keys(params).sort().reduce((acc, key) => acc + key + params[key], '');
  const computed = crypto
    .createHmac('sha1', authToken)
    .update(Buffer.from(data, 'utf-8'))
    .digest('base64');
  
  console.log('[sms-inbound] Signature validation - publicUrl:', publicUrl, 'match:', computed === signature);
  return computed === signature;
}

export async function POST(req: NextRequest) {
  console.log('[sms-inbound] Received webhook');
  
  try {
    const rawBody = await req.text();
    const isValid = validateTwilioRequest(req, rawBody);

    if (!isValid) {
      console.warn('[sms-inbound] Invalid Twilio signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }

    // Parse form data payload from Twilio
    const params = new URLSearchParams(rawBody);
    const from = params.get('From') || '';
    const body = params.get('Body') || '';
    
    console.log('[sms-inbound] From:', from, 'Body:', body);
    
    if (!from || !body) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    // ==========================================
    // TCPA COMPLIANCE: Handle STOP/HELP keywords FIRST
    // These must be processed before ANY other logic.
    // ==========================================
    const complianceKeyword = await detectComplianceKeyword(body);
    if (complianceKeyword === 'stop') {
      const result = await handleSmsOptOut(from);
      await sendSmsReply(from, result.message);
      return NextResponse.json({ status: 'ok' });
    }
    if (complianceKeyword === 'help') {
      const result = await handleSmsHelp(from);
      await sendSmsReply(from, result.message);
      return NextResponse.json({ status: 'ok' });
    }
    
    // Find player by phone number
    const player = await getPlayerByPhone(from);
    if (!player) {
      console.log('[sms-inbound] Unknown phone number:', from);
      // Send helpful response
      await sendSmsReply(from, "I don't recognize this number. Please make sure your phone is registered in LocalDink.");
      return NextResponse.json({ status: 'ok' });
    }
    
    console.log('[sms-inbound] Player found:', player.firstName, player.lastName);
    
    // Build participant key for conversation lookup
    // Player could be in conversations as "player:XXXX" (unlinked) or as their user ID (linked)
    const playerParticipantKey = `player:${player.id}`;
    const linkedUserId = (player as any).linkedUserId;
    
    // Detect intent from the message
    const intentResult = await detectSmsIntent(body);
    console.log('[sms-inbound] Intent:', intentResult);
    
    let responseMessage: string;
    
    switch (intentResult.intent) {
      case 'accept': {
        // Find pending game for this player
        const pendingGame = await findPendingGameForPlayer(player.id);
        if (!pendingGame) {
          responseMessage = "You don't have any pending game invites right now.";
        } else {
          const result = await handleAccept(player.id, pendingGame.id);
          responseMessage = result.message;
        }
        break;
      }
      
      case 'decline': {
        const pendingGame = await findPendingGameForPlayer(player.id);
        if (!pendingGame) {
          responseMessage = "You don't have any pending game invites to decline.";
        } else {
          const result = await handleDecline(player.id, pendingGame.id);
          responseMessage = result.message;
        }
        break;
      }
      
      case 'cancel': {
        // Find confirmed game for this player
        const confirmedGame = await findConfirmedGameForPlayer(player.id);
        if (!confirmedGame) {
          responseMessage = "You don't have any confirmed games to cancel.";
        } else {
          const result = await handleCancel(player.id, confirmedGame.id);
          responseMessage = result.message;
        }
        break;
      }
      
      case 'question':
      default: {
        // Not a clear RSVP intent — try to route to a conversation
        const conversationResult = await routeToConversation({
          playerParticipantKey,
          linkedUserId,
          playerName: `${player.firstName || ''} ${player.lastName || ''}`.trim() || 'Unknown',
          text: body,
          fromPhone: from,
        });
        
        if (conversationResult) {
          responseMessage = conversationResult;
        } else {
          responseMessage = intentResult.followUpQuestion || 
            "I didn't understand. Reply YES to join a game, NO to decline, or CANCEL to back out of a confirmed game.";
        }
      }
    }
    
    // Send response
    await sendSmsReply(from, responseMessage);
    
    // Log the interaction
    console.log('[sms-inbound] Sent response:', responseMessage);
    
    // Return empty TwiML (we already sent the reply via API)
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { headers: { 'Content-Type': 'text/xml' } }
    );
    
  } catch (error) {
    console.error('[sms-inbound] Error processing webhook:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Send SMS reply to player
 */
async function sendSmsReply(to: string, message: string): Promise<void> {
  const normalized = normalizeToE164(to);
  if (!normalized) return;
  
  try {
    await sendSmsMessage({ to: normalized, body: message });
  } catch (error) {
    console.error('[sms-inbound] Failed to send reply:', error);
  }
}

/**
 * Create TwiML response (Twilio expects this format)
 */
function createTwimlResponse(message: string): NextResponse {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(message)}</Message>
</Response>`;
  
  return new NextResponse(twiml, {
    headers: {
      'Content-Type': 'text/xml',
    },
  });
}

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Route an inbound SMS to the player's most recent active conversation.
 * Inserts the message, updates conversation metadata, and notifies other participants.
 * Returns a confirmation message, or null if no conversation was found.
 */
async function routeToConversation(params: {
  playerParticipantKey: string; // "player:XXXX"
  linkedUserId?: string;       // user UID if player is linked to an account
  playerName: string;
  text: string;
  fromPhone: string;
}): Promise<string | null> {
  const { playerParticipantKey, linkedUserId, playerName, text, fromPhone } = params;
  
  const adminDb = await getAdminDb();
  if (!adminDb) return null;
  
  // Find conversations where this player is a participant
  // Check both the player:XXXX key and (if linked) the user UID
  const keysToSearch = [playerParticipantKey];
  if (linkedUserId) keysToSearch.push(linkedUserId);
  
  let conversation: { id: string; participantIds: string[]; participantNames: Record<string, string> } | null = null;
  
  for (const key of keysToSearch) {
    const snap = await adminDb.collection('conversations')
      .where('participantIds', 'array-contains', key)
      .orderBy('lastActivityAt', 'desc')
      .limit(1)
      .get();
    
    if (!snap.empty) {
      const doc = snap.docs[0];
      const data = doc.data();
      conversation = {
        id: doc.id,
        participantIds: data.participantIds || [],
        participantNames: data.participantNames || {},
      };
      break;
    }
  }
  
  if (!conversation) {
    console.log('[sms-inbound] No active conversation found for', playerParticipantKey);
    return null;
  }
  
  console.log('[sms-inbound] Routing to conversation:', conversation.id);
  
  // Determine the sender ID (use linked user ID if available, otherwise player key)
  const senderId = linkedUserId || playerParticipantKey;
  
  // Insert the message into the conversation
  await adminDb.collection('conversations').doc(conversation.id).collection('messages').add({
    conversationId: conversation.id,
    senderId,
    senderName: playerName,
    text,
    sentAt: FieldValue.serverTimestamp(),
    source: 'sms', // Mark as SMS-originated
  });
  
  // Update conversation metadata
  await adminDb.collection('conversations').doc(conversation.id).update({
    lastMessage: {
      text: text.substring(0, 100),
      senderId,
      senderName: playerName,
      sentAt: FieldValue.serverTimestamp(),
    },
    lastActivityAt: FieldValue.serverTimestamp(),
  });
  
  // Notify other participants
  const otherParticipants = conversation.participantIds.filter(id => id !== senderId && id !== playerParticipantKey);
  const preview = text.length > 50 ? text.substring(0, 50) + '...' : text;
  
  for (const recipientId of otherParticipants) {
    if (recipientId.startsWith('player:')) {
      // Another player — forward via SMS
      const playerId = recipientId.replace('player:', '');
      try {
        const playerDoc = await adminDb.collection('players').doc(playerId).get();
        if (playerDoc.exists) {
          const playerData = playerDoc.data()!;
          const phone = normalizeToE164(playerData.phone);
          if (phone && phone !== normalizeToE164(fromPhone)) {
            await sendSmsMessage({ to: phone, body: `${playerName}: ${text}` });
          }
        }
      } catch (e) {
        console.error(`[sms-inbound] Failed to forward SMS to player ${playerId}:`, e);
      }
    } else {
      // App user — send in-app notification
      try {
        const { sendNotification } = await import('@/lib/notifications');
        await sendNotification({
          userId: recipientId,
          type: 'NEW_MESSAGE',
          data: {
            conversationId: conversation.id,
            senderName: playerName,
            messagePreview: preview,
          },
          templateData: {
            inviterName: playerName,
          },
        });
      } catch (e) {
        console.error(`[sms-inbound] Failed to notify user ${recipientId}:`, e);
      }
    }
  }
  
  console.log('[sms-inbound] Message inserted into conversation', conversation.id);
  return `Message delivered to your conversation. Reply anytime to keep chatting.`;
}

// Health check
export async function GET() {
  return NextResponse.json({ status: 'SMS webhook endpoint ready' });
}

