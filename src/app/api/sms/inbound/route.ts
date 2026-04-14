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
import { sendSmsMessage, normalizeToE164 } from '@/server/telnyx';

// Telnyx sends webhooks from this IP range: 192.76.120.192/27
// In production, validate via IP allowlisting or webhook signatures.

export async function POST(req: NextRequest) {
  console.log('[sms-inbound] Received webhook');
  
  try {
    const payload = await req.json();
    const eventType = payload?.data?.event_type;

    // Only process inbound messages
    if (eventType !== 'message.received') {
      console.log('[sms-inbound] Ignoring event type:', eventType);
      return NextResponse.json({ status: 'ignored' });
    }

    const messagePayload = payload.data.payload;
    const from = messagePayload?.from?.phone_number || '';
    const body = messagePayload?.text || '';
    
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
    
    return NextResponse.json({ status: 'ok' });
    
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

// Health check
export async function GET() {
  return NextResponse.json({ status: 'SMS webhook endpoint ready' });
}

