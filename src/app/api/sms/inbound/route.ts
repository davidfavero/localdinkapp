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
import { relayMessage as relayMessageFn } from '@/ai/tools/relay-message';

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

// In-memory dedup cache to prevent Twilio retry storms.
// Twilio retries webhooks after ~15s if no response, causing duplicate processing.
const recentMessageSids = new Map<string, number>();
const DEDUP_TTL_MS = 5 * 60 * 1000; // 5 minutes

function isDuplicate(messageSid: string): boolean {
  // Clean old entries
  const now = Date.now();
  for (const [sid, ts] of recentMessageSids) {
    if (now - ts > DEDUP_TTL_MS) recentMessageSids.delete(sid);
  }
  if (recentMessageSids.has(messageSid)) {
    console.log('[sms-inbound] Duplicate MessageSid, skipping:', messageSid);
    return true;
  }
  recentMessageSids.set(messageSid, now);
  return false;
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
    const messageSid = params.get('MessageSid') || '';
    
    console.log('[sms-inbound] From:', from, 'Body:', body, 'SID:', messageSid);
    
    if (!from || !body) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Deduplicate — Twilio retries if we take >15s, causing cascading API calls
    if (messageSid && isDuplicate(messageSid)) {
      return new NextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { 'Content-Type': 'text/xml' } }
      );
    }
    
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
      await sendSmsReply(from, result.message, true); // Compliance response — no footer
      return NextResponse.json({ status: 'ok' });
    }
    if (complianceKeyword === 'help') {
      const result = await handleSmsHelp(from);
      await sendSmsReply(from, result.message, true); // Compliance response — no footer
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
    
    // Detect intent from the message
    const intentResult = await detectSmsIntent(body);
    console.log('[sms-inbound] Intent:', intentResult);
    
    // ==========================================
    // SCHEDULING or RELAY: Route to Robin AI immediately
    // Scheduling: "Set up a game with David Thompson tomorrow at 2pm at ION"
    // Relay: "Tell everyone I'm running late"
    // Return 200 to Twilio immediately, process Robin in background.
    // ==========================================
    if (intentResult.intent === 'scheduling' || intentResult.intent === 'relay') {
      const resolvedUserId = linkedUserId || player.id;
      
      // Send immediate acknowledgment so the user knows we're on it
      const ackMessage = intentResult.intent === 'relay'
        ? "On it! 🏓 Sending your message now..."
        : "Got it! 🎾 Working on that invite for you...";
      sendSmsReply(from, ackMessage).catch(() => {});
      
      // Fire and forget — process Robin async, reply via API when done
      handleSmsChatWithRobin(resolvedUserId, body, from)
        .then(async (robinResult) => {
          await sendSmsReply(from, robinResult);
          console.log('[sms-inbound] Robin scheduling reply sent:', robinResult.substring(0, 80));
        })
        .catch((err) => {
          console.error('[sms-inbound] Robin scheduling failed:', err);
          sendSmsReply(from, "Sorry, I ran into an issue scheduling that. Please try again.").catch(() => {});
        });
      // Return immediately so Twilio doesn't retry
      return new NextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { 'Content-Type': 'text/xml' } }
      );
    }

    // Determine if this is a short, clear-cut RSVP response.
    // Short replies like "Y", "YES", "N", "NO", "CANCEL" go to RSVP.
    // Everything else goes to Robin — she owns the SMS channel.
    const trimmedBody = body.trim();
    const isShortReply = trimmedBody.split(/\s+/).length <= 3;
    const isHighConfidenceRsvp = intentResult.confidence === 'high' && isShortReply;
    
    let responseMessage: string;
    
    // If it's not a clear RSVP and not a cancel, route everything to Robin
    if (!isHighConfidenceRsvp && intentResult.intent !== 'cancel') {
      const resolvedUserId = linkedUserId || player.id;
      
      // Route to Robin — she handles scheduling, questions, relays, everything
      handleSmsChatWithRobin(resolvedUserId, body, from)
        .then(async (robinResult) => {
          await sendSmsReply(from, robinResult);
          console.log('[sms-inbound] Robin reply sent:', robinResult.substring(0, 80));
        })
        .catch((err) => {
          console.error('[sms-inbound] Robin failed:', err);
          sendSmsReply(from, "Sorry, I ran into an issue. Reply Y to join a game, N to decline, or OUT to cancel.").catch(() => {});
        });
      // Return immediately so Twilio doesn't retry
      return new NextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { 'Content-Type': 'text/xml' } }
      );
    }
    
    switch (intentResult.intent) {
      case 'accept': {
        // Try all resolved IDs to find a pending game
        let pendingGame = null;
        for (const pid of allPlayerIds) {
          pendingGame = await findPendingGameForPlayer(pid);
          if (pendingGame) break;
        }
        if (!pendingGame) {
          responseMessage = "You don't have any pending game invites right now.";
        } else {
          const result = await handleAccept(pendingGame.matchedPlayerId, pendingGame.id);
          responseMessage = result.message;
        }
        break;
      }
      
      case 'decline': {
        let pendingGame = null;
        for (const pid of allPlayerIds) {
          pendingGame = await findPendingGameForPlayer(pid);
          if (pendingGame) break;
        }
        if (!pendingGame) {
          responseMessage = "You don't have any pending game invites to decline.";
        } else {
          const result = await handleDecline(pendingGame.matchedPlayerId, pendingGame.id);
          responseMessage = result.message;
        }
        break;
      }
      
      case 'cancel': {
        let confirmedGame = null;
        for (const pid of allPlayerIds) {
          confirmedGame = await findConfirmedGameForPlayer(pid);
          if (confirmedGame) break;
        }
        if (!confirmedGame) {
          responseMessage = "You don't have any confirmed games to cancel.";
        } else {
          const result = await handleCancel(confirmedGame.matchedPlayerId, confirmedGame.id);
          responseMessage = result.message;
        }
        break;
      }
      
      case 'question':
      default: {
        // Not a clear RSVP intent — route to Robin AI (async)
        const resolvedUserId = linkedUserId || player.id;
        handleSmsChatWithRobin(resolvedUserId, body, from)
          .then(async (robinResult) => {
            await sendSmsReply(from, robinResult);
            console.log('[sms-inbound] Robin fallback reply sent:', robinResult.substring(0, 80));
          })
          .catch((err) => {
            console.error('[sms-inbound] Robin fallback failed:', err);
            sendSmsReply(from, "Sorry, I didn't understand that. Reply Y to join a game, N to decline, or OUT to cancel.").catch(() => {});
          });
        // Return immediately
        return new NextResponse(
          '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
          { headers: { 'Content-Type': 'text/xml' } }
        );
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
 * Send SMS reply to player (appends STOP footer for TCPA compliance)
 */
async function sendSmsReply(to: string, message: string, skipFooter = false): Promise<void> {
  const normalized = normalizeToE164(to);
  if (!normalized) return;
  
  const body = skipFooter ? message : `${message}\n\nReply STOP to opt out`;
  
  try {
    await sendSmsMessage({ to: normalized, body });
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
 * Handle an SMS message by routing it through Robin AI.
 * Robin is the sole owner of the SMS channel — she handles scheduling,
 * questions, game queries, and message relays to other players.
 * 
 * Loads the user's players/courts/groups, maintains conversation history
 * in Firestore, and returns Robin's text response.
 */
const SMS_SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes — sessions expire after inactivity

async function handleSmsChatWithRobin(userId: string, message: string, senderPhone: string): Promise<string> {
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

    // Execute relay if Robin detected a relay message
    if (response.relayMessage) {
      const relayResult = await relayMessageFn({
        senderId: resolvedUserId,
        senderName: `${currentUser.firstName} ${currentUser.lastName}`.trim(),
        senderPhone: senderPhone,
        message: response.relayMessage,
      });
      
      if (!relayResult.success) {
        console.log('[sms-robin] Relay failed:', relayResult.error);
        // Override Robin's optimistic confirmation with the actual error
        const errorReply = relayResult.error || "I couldn't find an upcoming game to relay your message to.";
        return errorReply;
      }
      console.log(`[sms-robin] Relayed message to ${relayResult.relayedTo} players`);
    }

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

