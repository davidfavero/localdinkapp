import { NextRequest, NextResponse } from 'next/server';
import { detectSmsIntent } from '@/ai/flows/sms-intent-detection';
import { 
  getPlayerByPhone, 
  findPendingGameForPlayer, 
  findConfirmedGameForPlayer,
  handleAccept,
  handleDecline,
  handleCancel,
} from '@/lib/rsvp-handler';
import { sendSmsMessage, normalizeToE164 } from '@/server/twilio';
import Twilio from 'twilio';

// Twilio webhook validation (strict in production)
function validateTwilioRequest(req: NextRequest, body: string): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = req.headers.get('x-twilio-signature');
  
  if (!authToken) {
    console.warn('[sms-inbound] Missing TWILIO_AUTH_TOKEN');
    return process.env.NODE_ENV !== 'production';
  }

  if (!signature) {
    console.warn('[sms-inbound] Missing x-twilio-signature header');
    return process.env.NODE_ENV !== 'production';
  }
  
  const url = req.url;
  const params = Object.fromEntries(new URLSearchParams(body));
  
  return Twilio.validateRequest(authToken, signature, url, params);
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
    
    // Find player by phone number
    const player = await getPlayerByPhone(from);
    if (!player) {
      console.log('[sms-inbound] Unknown phone number:', from);
      // Send helpful response
      await sendSmsReply(from, "I don't recognize this number. Please make sure your phone is registered in LocalDink.");
      return createTwimlResponse("Unknown number");
    }
    
    console.log('[sms-inbound] Player found:', player.firstName, player.lastName);
    
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
      
      case 'question': {
        responseMessage = "For help, check the LocalDink app or contact the game organizer. Reply YES to join a game or NO to decline.";
        break;
      }
      
      default: {
        // Unknown intent - ask for clarification
        responseMessage = intentResult.followUpQuestion || 
          "I didn't understand. Reply YES to join a game, NO to decline, or CANCEL to back out of a confirmed game.";
      }
    }
    
    // Send response
    await sendSmsReply(from, responseMessage);
    
    // Log the interaction
    console.log('[sms-inbound] Sent response:', responseMessage);
    
    // Return TwiML response
    return createTwimlResponse(responseMessage);
    
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

// Also handle GET for Twilio webhook verification
export async function GET(req: NextRequest) {
  return NextResponse.json({ status: 'SMS webhook endpoint ready' });
}

