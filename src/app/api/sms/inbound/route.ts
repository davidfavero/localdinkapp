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
import type { Player, Group, Court, ChatHistory } from '@/lib/types';

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
    
    console.log('[sms-inbound] Player found:', player.firstName, player.lastName, 'id:', player.id, 'linkedUserId:', (player as any).linkedUserId);
    
    // Resolve all possible IDs for this person:
    // - player doc ID (from players collection)
    // - linked user UID (if the player contact is linked to a registered user)
    // Game sessions may reference either depending on how the invite was created.
    const linkedUserId: string | undefined = (player as any).linkedUserId;
    const allPlayerIds = [player.id];
    if (linkedUserId && linkedUserId !== player.id) {
      allPlayerIds.push(linkedUserId);
    }
    
    // Also check if getPlayerByPhone returned a users doc — in that case,
    // look for player docs linked to this user
    const adminDb = await getAdminDb();
    if (adminDb) {
      const linkedPlayers = await adminDb.collection('players')
        .where('linkedUserId', '==', player.id)
        .get();
      for (const doc of linkedPlayers.docs) {
        if (!allPlayerIds.includes(doc.id)) {
          allPlayerIds.push(doc.id);
        }
      }
      // Also check if there's a user with this phone
      const normalizedFrom = normalizeToE164(from);
      if (normalizedFrom) {
        const userByPhone = await adminDb.collection('users')
          .where('phone', '==', normalizedFrom)
          .limit(1)
          .get();
        if (!userByPhone.empty && !allPlayerIds.includes(userByPhone.docs[0].id)) {
          allPlayerIds.push(userByPhone.docs[0].id);
        }
      }
    }
    
    console.log('[sms-inbound] All resolved IDs:', allPlayerIds);
    
    // Build participant key for conversation lookup
    const playerParticipantKey = `player:${player.id}`;
    
    // Detect intent from the message
    const intentResult = await detectSmsIntent(body);
    console.log('[sms-inbound] Intent:', intentResult);
    
    // Determine if this is a short, clear-cut RSVP response vs a conversational message.
    // Short replies like "Y", "YES", "N", "NO", "CANCEL" should always go to RSVP.
    // Longer messages (even if AI detects "accept" intent) should try conversation
    // routing first — they're likely replies to Player Messages, not game invites.
    const trimmedBody = body.trim();
    const isShortReply = trimmedBody.split(/\s+/).length <= 3;
    const isHighConfidenceRsvp = intentResult.confidence === 'high' && isShortReply;
    
    let responseMessage: string;
    
    // For longer messages or low-confidence intents, try conversation routing FIRST
    if (!isHighConfidenceRsvp && intentResult.intent !== 'cancel') {
      const conversationResult = await routeToConversation({
        playerParticipantKey,
        linkedUserId,
        allParticipantIds: allPlayerIds,
        playerName: `${player.firstName || ''} ${player.lastName || ''}`.trim() || 'Unknown',
        text: body,
        fromPhone: from,
      });
      
      if (conversationResult) {
        responseMessage = conversationResult;
        // Send response and return early — this was a conversation reply
        await sendSmsReply(from, responseMessage);
        console.log('[sms-inbound] Routed to conversation:', responseMessage);
        return new NextResponse(
          '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
          { headers: { 'Content-Type': 'text/xml' } }
        );
      }
      // No conversation found — check if this looks like a scheduling request
      // and route to Robin. Only do this if intent is NOT accept/decline (those
      // should always fall through to RSVP handling).
      if (intentResult.intent === 'question') {
        const schedulingKeywords = ['schedule', 'book', 'setup', 'set up', 'tomorrow', 'tonight', 'morning', 'afternoon', 'this weekend', 'next week'];
        const lowerBody = body.toLowerCase();
        const looksLikeScheduling = schedulingKeywords.some(k => lowerBody.includes(k));
        if (looksLikeScheduling) {
          const resolvedUserId = linkedUserId || player.id;
          const robinResult = await handleSmsChatWithRobin(resolvedUserId, body);
          await sendSmsReply(from, robinResult);
          console.log('[sms-inbound] Routed to Robin (scheduling):', robinResult);
          return new NextResponse(
            '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
            { headers: { 'Content-Type': 'text/xml' } }
          );
        }
      }
      // Not scheduling, not a conversation — fall through to RSVP handling
    }
    
    switch (intentResult.intent) {
      case 'accept': {
        // Try all resolved IDs to find a pending game
        let pendingGame = null;
        let matchedId = '';
        for (const pid of allPlayerIds) {
          pendingGame = await findPendingGameForPlayer(pid);
          if (pendingGame) { matchedId = pid; break; }
        }
        if (!pendingGame) {
          responseMessage = "You don't have any pending game invites right now.";
        } else {
          const result = await handleAccept(matchedId, pendingGame.id);
          responseMessage = result.message;
        }
        break;
      }
      
      case 'decline': {
        let pendingGame = null;
        let matchedId = '';
        for (const pid of allPlayerIds) {
          pendingGame = await findPendingGameForPlayer(pid);
          if (pendingGame) { matchedId = pid; break; }
        }
        if (!pendingGame) {
          responseMessage = "You don't have any pending game invites to decline.";
        } else {
          const result = await handleDecline(matchedId, pendingGame.id);
          responseMessage = result.message;
        }
        break;
      }
      
      case 'cancel': {
        let confirmedGame = null;
        let matchedId = '';
        for (const pid of allPlayerIds) {
          confirmedGame = await findConfirmedGameForPlayer(pid);
          if (confirmedGame) { matchedId = pid; break; }
        }
        if (!confirmedGame) {
          responseMessage = "You don't have any confirmed games to cancel.";
        } else {
          const result = await handleCancel(matchedId, confirmedGame.id);
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
          allParticipantIds: allPlayerIds,
          playerName: `${player.firstName || ''} ${player.lastName || ''}`.trim() || 'Unknown',
          text: body,
          fromPhone: from,
        });
        
        if (conversationResult) {
          responseMessage = conversationResult;
        } else {
          // No RSVP match, no conversation — route to Robin AI
          const resolvedUserId = linkedUserId || player.id;
          const robinResult = await handleSmsChatWithRobin(resolvedUserId, body);
          responseMessage = robinResult;
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
  allParticipantIds: string[]; // all possible IDs for this person
  playerName: string;
  text: string;
  fromPhone: string;
}): Promise<string | null> {
  const { playerParticipantKey, linkedUserId, allParticipantIds, playerName, text, fromPhone } = params;
  
  const adminDb = await getAdminDb();
  if (!adminDb) return null;
  
  // Find conversations where this player is a participant
  // Check all possible IDs: player:XXXX key, user UID, linked user ID
  const keysToSearch = [playerParticipantKey, ...allParticipantIds];
  
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

/**
 * Handle an SMS message by routing it through Robin AI.
 * Loads the user's players/courts/groups, maintains conversation history
 * in Firestore, and returns Robin's text response.
 */
const SMS_SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes — sessions expire after inactivity

async function handleSmsChatWithRobin(userId: string, message: string): Promise<string> {
  console.log('[sms-robin] Starting for user:', userId, 'message:', message.substring(0, 80));
  
  const adminDb = await getAdminDb();
  if (!adminDb) {
    return "Sorry, I'm having trouble right now. Please try again in a moment.";
  }

  try {
    // Load user profile — userId might be a user doc ID or a player doc ID
    let userData: Record<string, any> | undefined;
    let resolvedUserId = userId;
    
    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (userDoc.exists) {
      userData = userDoc.data()!;
    } else {
      // userId is a player doc ID — check for linkedUserId
      const playerDoc = await adminDb.collection('players').doc(userId).get();
      if (playerDoc.exists) {
        const playerData = playerDoc.data()!;
        if (playerData.linkedUserId) {
          resolvedUserId = playerData.linkedUserId;
          const linkedUserDoc = await adminDb.collection('users').doc(resolvedUserId).get();
          if (linkedUserDoc.exists) {
            userData = linkedUserDoc.data()!;
          }
        }
      }
    }

    if (!userData) {
      return "I don't have your profile set up yet. Please open the LocalDink app to get started.";
    }

    const currentUser: Player = {
      id: resolvedUserId,
      firstName: userData.firstName || '',
      lastName: userData.lastName || '',
      phone: userData.phone || '',
      email: userData.email || '',
      avatarUrl: userData.avatarUrl || '',
      isCurrentUser: true,
      timezone: userData.timezone,
      ownerId: resolvedUserId,
    };

    // Load user's players (contacts)
    const playersSnap = await adminDb.collection('players')
      .where('ownerId', '==', resolvedUserId)
      .get();
    const players: Player[] = [
      currentUser,
      ...playersSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as Player)),
    ];

    // Load user's courts
    const courtsSnap = await adminDb.collection('courts')
      .where('ownerId', '==', resolvedUserId)
      .get();
    const courts: Court[] = courtsSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as Court));

    // Load user's groups
    const groupsSnap = await adminDb.collection('groups')
      .where('ownerId', '==', resolvedUserId)
      .get();
    const groups: (Group & { id: string })[] = groupsSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as Group & { id: string }));

    // Load or create SMS Robin session for conversation continuity
    const sessionRef = adminDb.collection('sms-robin-sessions').doc(resolvedUserId);
    const sessionDoc = await sessionRef.get();
    let history: ChatHistory[] = [];

    if (sessionDoc.exists) {
      const sessionData = sessionDoc.data()!;
      const lastActivity = sessionData.lastActivityAt?.toMillis?.() || 0;
      // Session still active?
      if (Date.now() - lastActivity < SMS_SESSION_TTL_MS) {
        history = sessionData.history || [];
      } else {
        console.log('[sms-robin] Session expired, starting fresh');
      }
    }

    // Call Robin
    const { chat } = await import('@/ai/flows/chat');
    const disambiguationMemory = userData.nameDisambiguationMemory || {};
    
    const response = await chat(
      players,
      { message, history },
      groups,
      courts,
      disambiguationMemory,
      {} // playFrequency — skip for SMS to keep it fast
    );

    // Build Robin's reply text
    const robinReply = response.confirmationText || "I'm not sure what you'd like to do. Try: 'Schedule a game with [name] tomorrow at 3pm at [court]'";

    // Update session history (keep last 10 messages to stay within SMS context)
    const updatedHistory: ChatHistory[] = [
      ...history,
      { sender: 'user' as const, text: message },
      { sender: 'robin' as const, text: robinReply },
    ].slice(-10);

    await sessionRef.set({
      userId: resolvedUserId,
      history: updatedHistory,
      lastActivityAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // Persist disambiguation memory updates
    if (response.disambiguationMemoryUpdates && Object.keys(response.disambiguationMemoryUpdates).length > 0) {
      const mergedMemory = { ...disambiguationMemory, ...response.disambiguationMemoryUpdates };
      await adminDb.collection('users').doc(resolvedUserId).set(
        { nameDisambiguationMemory: mergedMemory },
        { merge: true }
      );
    }

    // Log the Robin action
    await adminDb.collection('robin-actions').add({
      userId: resolvedUserId,
      source: 'sms',
      inputMessage: message,
      extractedPlayers: response.players || [],
      extractedDate: response.date || null,
      extractedTime: response.time || null,
      extractedLocation: response.location || null,
      invitedPlayers: (response.invitedPlayers || []).map(p => ({ id: p.id || null, name: p.name })),
      createdSessionId: response.createdSessionId || null,
      notifiedCount: response.notifiedCount || 0,
      skippedPlayers: response.skippedPlayers || [],
      createdAt: new Date().toISOString(),
    }).catch(e => console.error('[sms-robin] Failed to log action:', e));

    console.log('[sms-robin] Response:', robinReply.substring(0, 80));
    return robinReply;
  } catch (error) {
    console.error('[sms-robin] Error:', error);
    return "Sorry, I ran into an issue. Please try again or use the LocalDink app.";
  }
}

// Health check
export async function GET() {
  return NextResponse.json({ status: 'SMS webhook endpoint ready' });
}

