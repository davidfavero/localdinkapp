'use server';

/**
 * @fileOverview AI-powered intent detection for inbound SMS messages.
 * Determines if a player is accepting, declining, or cancelling.
 */

import { ai, geminiFlash } from '@/ai/genkit';
import { z } from 'zod';

// Possible intents from an SMS reply
export type SmsIntent = 
  | 'accept'      // Player wants to join
  | 'decline'     // Player doesn't want to join
  | 'cancel'      // Player was confirmed but wants out
  | 'scheduling'  // Player wants to schedule/set up a game
  | 'relay'       // Player wants to send a message to their game group
  | 'question'    // Player is asking a question
  | 'unknown';    // Can't determine intent

export type SmsIntentResult = {
  intent: SmsIntent;
  confidence: 'high' | 'medium' | 'low';
  extractedGameCode?: string;  // If they mentioned a game code
  followUpQuestion?: string;   // If we need to ask for clarification
};

// TCPA compliance keywords — must be handled BEFORE any other intent detection
const STOP_PATTERNS = [
  /^(stop|stopall|unsubscribe|end|quit)$/i,
];

const HELP_PATTERNS = [
  /^(help|info)$/i,
];

/**
 * Check for TCPA compliance keywords (STOP/HELP).
 * These MUST be handled before any game-related intent detection.
 */
export async function detectComplianceKeyword(message: string): Promise<'stop' | 'help' | null> {
  const trimmed = message.trim();
  for (const pattern of STOP_PATTERNS) {
    if (pattern.test(trimmed)) return 'stop';
  }
  for (const pattern of HELP_PATTERNS) {
    if (pattern.test(trimmed)) return 'help';
  }
  return null;
}

// Common patterns we can detect without AI
const ACCEPT_PATTERNS = [
  /^(y|yes|yep|yeah|yea|ya|yup|sure|ok|okay|k|in|im in|i'm in|count me in|i'll be there|see you there|confirmed|accept|joining|join|down|let's go|lets go|absolutely|definitely|for sure|👍|✅|🎾)$/i,
];

const DECLINE_PATTERNS = [
  /^(n|no|nope|nah|can't|cant|cannot|pass|skip|not this time|maybe next time|decline|busy|unavailable|sorry|❌|👎)$/i,
];

const CANCEL_PATTERNS = [
  /^(out|i'm out|im out|cancel|canceling|cancelling|back out|backing out|pull out|pulling out|drop|dropping|remove me|take me out|something came up|can't make it anymore|cant make it)$/i,
];

/**
 * Quick pattern matching for common responses (no AI needed)
 */
function quickPatternMatch(message: string): SmsIntentResult | null {
  const trimmed = message.trim().toLowerCase();
  
  for (const pattern of ACCEPT_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { intent: 'accept', confidence: 'high' };
    }
  }
  
  for (const pattern of DECLINE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { intent: 'decline', confidence: 'high' };
    }
  }
  
  for (const pattern of CANCEL_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { intent: 'cancel', confidence: 'high' };
    }
  }
  
  // Scheduling patterns — detect game scheduling requests
  // These are longer messages that mention setting up / scheduling a game
  const SCHEDULING_INDICATORS = [
    /\b(set\s*up|schedule|book|organize|arrange|plan)\b.*\b(game|match|session|pickleball)\b/i,
    /\b(game|match|session|pickleball)\b.*\b(with|at|tomorrow|tonight|today|this|next)\b/i,
    /\b(schedule|set\s*up|book)\b.*\b(with|for|at)\b/i,
    /\b(play|game)\b.*\bwith\b.*\b(tomorrow|tonight|today|at\s+\d|this|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    /\b(invite|send\s+invite|get\s+a\s+game)\b/i,
  ];
  
  // Relay patterns — detect messages intended for the game group
  const RELAY_INDICATORS = [
    /\b(tell|let)\s+(everyone|the\s+group|them|the\s+team|everybody)\b/i,
    /\b(let)\s+(everyone|the\s+group|them|the\s+team|everybody)\s+know\b/i,
    /\b(send|relay|forward|pass\s+along)\s+(to|this\s+to)\s+(the\s+group|everyone|them)\b/i,
    /\b(running\s+late|running\s+\d+\s+min|be\s+there\s+in)\b/i,
    /\b(tell|ask)\s+\w+\s+(if|to|that|about)\b/i,
  ];
  
  if (trimmed.length > 15) { // These messages are always longer than single-word RSVP replies
    // Check relay patterns first (more specific)
    for (const pattern of RELAY_INDICATORS) {
      if (pattern.test(trimmed)) {
        return { intent: 'relay', confidence: 'high' };
      }
    }
    
    for (const pattern of SCHEDULING_INDICATORS) {
      if (pattern.test(trimmed)) {
        return { intent: 'scheduling', confidence: 'high' };
      }
    }
  }
  
  // Check for game codes (format: 4-6 alphanumeric)
  const codeMatch = trimmed.match(/\b([a-z0-9]{4,6})\b/i);
  if (codeMatch) {
    // If they just sent a code with yes/no
    if (/yes|in|join/i.test(trimmed)) {
      return { intent: 'accept', confidence: 'high', extractedGameCode: codeMatch[1].toUpperCase() };
    }
    if (/no|out|pass/i.test(trimmed)) {
      return { intent: 'decline', confidence: 'high', extractedGameCode: codeMatch[1].toUpperCase() };
    }
  }
  
  return null; // Need AI for this one
}

/**
 * Use AI to detect intent for ambiguous messages
 */
async function aiIntentDetection(message: string): Promise<SmsIntentResult> {
  // If AI is not available, make best guess
  if (!geminiFlash) {
    console.warn('[sms-intent] AI not available, using fallback');
    return { intent: 'unknown', confidence: 'low', followUpQuestion: "I didn't understand. Reply YES to join or NO to decline." };
  }

  try {
    const result = await ai.generate({
      model: geminiFlash,
      prompt: `You are analyzing an SMS message sent to LocalDink, a pickleball game scheduling service.
      
The person texted this message:
"${message}"

Determine their intent. Options:
- "scheduling" = They want to schedule, set up, book, or organize a game
- "accept" = They want to join/accept an existing game invitation
- "decline" = They don't want to join an existing game invitation
- "cancel" = They previously accepted but now want to back out
- "relay" = They want to send a message to their game group (e.g. "tell everyone I'm late", "running 10 minutes late")
- "question" = They're asking for more information or chatting
- "unknown" = Can't determine what they want

Also determine confidence (high/medium/low) and if we need to ask a follow-up question.

Respond in JSON format only:
{
  "intent": "scheduling|accept|decline|cancel|relay|question|unknown",
  "confidence": "high|medium|low",
  "followUpQuestion": "optional question if intent is unclear"
}`,
      output: {
        schema: z.object({
          intent: z.enum(['scheduling', 'accept', 'decline', 'cancel', 'relay', 'question', 'unknown']),
          confidence: z.enum(['high', 'medium', 'low']),
          followUpQuestion: z.string().optional(),
        }),
      },
      config: { temperature: 0.1 },
    });

    const output = result?.output;
    if (output) {
      return {
        intent: output.intent,
        confidence: output.confidence,
        followUpQuestion: output.followUpQuestion,
      };
    }
  } catch (error) {
    console.error('[sms-intent] AI error:', error);
  }

  // Fallback if AI fails
  return { 
    intent: 'unknown', 
    confidence: 'low',
    followUpQuestion: "I didn't catch that. Reply YES to join or NO to decline." 
  };
}

/**
 * Main function to detect SMS intent
 * Uses quick pattern matching first, falls back to AI for ambiguous messages
 */
export async function detectSmsIntent(message: string): Promise<SmsIntentResult> {
  console.log('[sms-intent] Analyzing:', message);
  
  // Try quick pattern matching first
  const quickResult = quickPatternMatch(message);
  if (quickResult) {
    console.log('[sms-intent] Quick match:', quickResult);
    return quickResult;
  }
  
  // Fall back to AI for ambiguous messages
  console.log('[sms-intent] Using AI for ambiguous message');
  const aiResult = await aiIntentDetection(message);
  console.log('[sms-intent] AI result:', aiResult);
  
  return aiResult;
}

