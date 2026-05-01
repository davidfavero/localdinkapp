'use server';

/**
 * @fileOverview Robin SMS Generation — dynamically generates SMS messages
 * in Robin's personality for all outbound communications.
 *
 * Robin is the ONLY voice players hear via SMS. Every message should feel
 * like it's coming from the same sharp, playful coordinator.
 */

import { ai, geminiFlash } from '@/ai/genkit';
import { ROBIN_SYSTEM_PROMPT } from '@/ai/robin-prompt';

// ============================================
// ROBIN SMS GENERATION
// ============================================

const ROBIN_SMS_SYSTEM = `${ROBIN_SYSTEM_PROMPT}

## SMS GENERATION RULES
You are generating an SMS message. Follow these rules strictly:
- Keep it SHORT (1-3 sentences max for most messages)
- Sound like a real person texting, not a notification system
- Use emoji sparingly but naturally (1-2 max per message)
- NEVER include "Reply STOP to opt out" — that gets appended automatically
- NEVER say "This is Robin" in every message — only on first contact
- Include relevant details (time, place, names) naturally
- Be warm but efficient — players get multiple texts, don't waste their time
`;

export type RobinSmsContext = {
  /** What type of message is this? */
  messageType:
    | 'first_contact'      // First time texting this player
    | 'game_invite'        // Inviting to a game
    | 'rsvp_accepted'      // Someone accepted an invite (notify organizer)
    | 'rsvp_declined'      // Someone declined an invite (notify organizer)
    | 'game_full'          // Game is now confirmed/full (notify all)
    | 'player_cancelled'   // Someone cancelled their spot
    | 'spot_opened'        // Waitlist player promoted
    | 'game_reminder'      // Game starting soon
    | 'game_changed'       // Game details changed
    | 'game_cancelled'     // Game was cancelled
    | 'message_relay'      // Relaying a message from another player
    | 'direct_message'     // Player-to-player message forwarded
    | 'welcome'            // New player added to system
    | 'spot_available_pending' // Game full, you're on waitlist / notification for pending
  ;
  /** Key details for the message */
  details: {
    recipientName?: string;
    organizerName?: string;
    playerName?: string;       // The player who did the action (accepted, cancelled, etc.)
    matchType?: string;        // Singles/Doubles
    date?: string;             // Human-readable date
    time?: string;             // Human-readable time
    courtName?: string;        // Court name
    courtLocation?: string;    // Court location/address
    confirmedPlayers?: string[];  // Names of confirmed players
    confirmedCount?: number;
    maxPlayers?: number;
    message?: string;          // For relay/direct messages
    senderName?: string;       // Who sent the relay
    adderName?: string;        // Who added this player to the system
    webLink?: string;          // Link to app
  };
  /** Is this the first time Robin has ever texted this person? */
  isFirstContact?: boolean;
};

/**
 * Generate a Robin-voiced SMS message dynamically.
 * Falls back to a template if AI is unavailable.
 */
export async function generateRobinSms(context: RobinSmsContext): Promise<string> {
  const { messageType, details, isFirstContact } = context;

  // Build the prompt for Robin
  const prompt = buildRobinSmsPrompt(context);

  try {
    if (!geminiFlash || !ai?.generate) {
      // AI not configured — use fallback templates
      return getFallbackMessage(context);
    }

    const result = await ai.generate({
      model: geminiFlash,
      system: ROBIN_SMS_SYSTEM,
      prompt,
      config: {
        temperature: 0.7, // More creative for personality
        maxOutputTokens: 200,
      },
    });

    const text = typeof result.output === 'string'
      ? result.output
      : ('text' in result ? (result as any).text?.trim() : null) || getFallbackMessage(context);

    // Ensure it doesn't include STOP (we add that separately)
    return text.replace(/\n?Reply STOP to opt out\.?/gi, '').trim();
  } catch (error) {
    console.error('[robin-sms] AI generation failed, using fallback:', error);
    return getFallbackMessage(context);
  }
}

/**
 * Build the user prompt for Robin based on the message context.
 */
function buildRobinSmsPrompt(context: RobinSmsContext): string {
  const { messageType, details, isFirstContact } = context;
  const d = details;

  let instruction = '';

  switch (messageType) {
    case 'first_contact':
    case 'welcome':
      instruction = `Generate a welcome SMS for ${d.recipientName || 'a new player'}. ${d.adderName || 'Someone'} just added them to LocalDink. Introduce yourself as Robin — their AI pickleball coordinator from LocalDink. Keep it warm and brief. Mention that when they get invited to games, they can just reply Y or N. If they want to schedule their own games, they can sign up at localdink.com/login.`;
      break;

    case 'game_invite':
      instruction = `Generate a game invite SMS for ${d.recipientName || 'a player'}.
Details: ${d.organizerName || 'The organizer'} is inviting them to play ${d.matchType || 'pickleball'}${d.courtName ? ` at ${d.courtName}` : ''}${d.courtLocation ? ` (${d.courtLocation})` : ''}. Game starts ${d.date || ''} ${d.time || ''}.
${isFirstContact ? 'This is the FIRST time Robin is texting this person — briefly introduce yourself as Robin, their AI pickleball coordinator from LocalDink.' : ''}
Tell them to reply Y to join or N to pass.`;
      break;

    case 'rsvp_accepted':
      instruction = `Notify ${d.recipientName || 'the organizer'} that ${d.playerName || 'a player'} just confirmed for their ${d.matchType || 'game'}${d.date ? ` on ${d.date}` : ''}.${d.confirmedCount && d.maxPlayers ? ` That makes it ${d.confirmedCount}/${d.maxPlayers} confirmed.` : ''} Keep it punchy and positive.`;
      break;

    case 'rsvp_declined':
      instruction = `Notify ${d.recipientName || 'the organizer'} that ${d.playerName || 'a player'} can't make their ${d.matchType || 'game'}${d.date ? ` on ${d.date}` : ''}. Be brief, don't be overly sympathetic. Mention you're keeping an eye on finding a replacement if needed.`;
      break;

    case 'game_full':
      instruction = `Notify ${d.recipientName || 'a player'} that their game is locked in — all spots filled!
Details: ${d.matchType || 'Pickleball'} at ${d.courtName || 'the courts'}, ${d.date || ''} ${d.time || ''}.
Players: ${d.confirmedPlayers?.join(', ') || 'the crew'}.
Be excited but brief. This is the "it's happening!" moment.`;
      break;

    case 'player_cancelled':
      instruction = `Notify ${d.recipientName || 'the organizer'} that ${d.playerName || 'a player'} just bailed on the ${d.matchType || 'game'}${d.date ? ` on ${d.date}` : ''}. Mention the spot is reopened. Be matter-of-fact, not dramatic.`;
      break;

    case 'spot_opened':
      instruction = `Tell ${d.recipientName || 'a player'} great news — a spot opened up and they've been promoted from the waitlist! They're now confirmed for ${d.matchType || 'the game'}${d.date ? ` on ${d.date}` : ''}${d.courtName ? ` at ${d.courtName}` : ''}. Be enthusiastic!`;
      break;

    case 'game_reminder':
      instruction = `Remind ${d.recipientName || 'a player'} their game is coming up soon. ${d.matchType || 'Pickleball'} at ${d.courtName || 'the courts'}, ${d.date || ''} ${d.time || ''}. Quick, casual reminder.`;
      break;

    case 'game_changed':
      instruction = `Let ${d.recipientName || 'a player'} know the game details changed. ${d.matchType || 'Game'}${d.date ? ` now on ${d.date}` : ''}${d.time ? ` at ${d.time}` : ''}${d.courtName ? ` at ${d.courtName}` : ''}. Keep it informative and brief.`;
      break;

    case 'game_cancelled':
      instruction = `Let ${d.recipientName || 'a player'} know the ${d.matchType || 'game'}${d.date ? ` on ${d.date}` : ''}${d.courtName ? ` at ${d.courtName}` : ''} has been cancelled. Be brief, empathetic but not over the top.`;
      break;

    case 'message_relay':
      instruction = `Relay a message from ${d.senderName || 'a player'} to ${d.recipientName || 'the group'}. The message is: "${d.message || ''}". Frame it as Robin passing along the note — e.g., "Quick note from [Name]: ..." Keep Robin's framing brief.`;
      break;

    case 'direct_message':
      instruction = `Forward a message from ${d.senderName || 'a player'} to ${d.recipientName || 'someone'}. The message is: "${d.message || ''}". Frame it as Robin delivering: "Message from [Name]: ..." Keep it clean and brief.`;
      break;

    case 'spot_available_pending':
      instruction = `Let ${d.recipientName || 'a player'} know the game${d.date ? ` on ${d.date}` : ''} is now full. They're on the list if a spot opens. Brief and reassuring.`;
      break;

    default:
      instruction = `Generate a brief, Robin-voiced notification SMS. Context: ${JSON.stringify(details)}`;
  }

  return instruction;
}

/**
 * Fallback templates when AI is unavailable.
 * Written in Robin's voice so they still feel right.
 */
function getFallbackMessage(context: RobinSmsContext): string {
  const { messageType, details, isFirstContact } = context;
  const d = details;

  switch (messageType) {
    case 'first_contact':
    case 'welcome':
      return `Hey ${d.recipientName || 'there'}! 👋 I'm Robin, your AI pickleball coordinator from LocalDink. ${d.adderName || 'Your friend'} just added you — when you get invited to a game, just reply Y or N. Easy as that! Want to schedule your own games? Sign up at localdink.com/login`;

    case 'game_invite': {
      const intro = isFirstContact
        ? `Hey ${d.recipientName || 'there'}! I'm Robin from LocalDink — ${d.organizerName || 'your friend'}'s pickleball coordinator. `
        : '';
      return `${intro}${d.organizerName || 'Your crew'} has a ${d.matchType || 'game'} going${d.courtName ? ` at ${d.courtName}` : ''}, ${d.date || ''} ${d.time || ''}. You in? Reply Y or N`;
    }

    case 'rsvp_accepted':
      return `${d.playerName || 'Someone'} is locked in for ${d.date || 'the game'} 🎾${d.confirmedCount && d.maxPlayers ? ` (${d.confirmedCount}/${d.maxPlayers} confirmed)` : ''}`;

    case 'rsvp_declined':
      return `${d.playerName || 'Someone'} can't make ${d.date || 'the game'}. I'll keep an eye out for a replacement.`;

    case 'game_full':
      return `Game on! 🎉 ${d.matchType || 'Pickleball'} at ${d.courtName || 'the courts'}, ${d.date || ''} ${d.time || ''}. Everyone's confirmed — see you there!`;

    case 'player_cancelled':
      return `Heads up — ${d.playerName || 'someone'} bailed on ${d.date || 'the game'}. Spot's reopened, I'm on it.`;

    case 'spot_opened':
      return `Great news, ${d.recipientName || ''}! 🎉 A spot opened up — you're confirmed for ${d.matchType || 'the game'}${d.date ? ` on ${d.date}` : ''}. See you there!`;

    case 'game_reminder':
      return `⏰ Heads up — ${d.matchType || 'your game'} at ${d.courtName || 'the courts'} is coming up${d.time ? ` at ${d.time}` : ' soon'}!`;

    case 'game_changed':
      return `Quick update — your ${d.matchType || 'game'} details changed.${d.date ? ` Now: ${d.date}` : ''}${d.time ? ` ${d.time}` : ''}${d.courtName ? ` at ${d.courtName}` : ''}. Check the app for details.`;

    case 'game_cancelled':
      return `Bummer — the ${d.matchType || 'game'}${d.date ? ` on ${d.date}` : ''}${d.courtName ? ` at ${d.courtName}` : ''} has been cancelled.`;

    case 'message_relay':
      return `Quick note from ${d.senderName || 'your group'}: "${d.message || ''}"`;

    case 'direct_message':
      return `Message from ${d.senderName || 'a player'}: "${d.message || ''}"`;

    case 'spot_available_pending':
      return `The game${d.date ? ` on ${d.date}` : ''} just filled up. You're on the list — I'll let you know if a spot opens!`;

    default:
      return `Hey! You have an update on LocalDink. Check the app for details.`;
  }
}

/**
 * Append the STOP footer to any Robin SMS message.
 * Call this on EVERY outbound SMS.
 */
export async function appendStopFooter(message: string): Promise<string> {
  return `${message}\n\nReply STOP to opt out`;
}
