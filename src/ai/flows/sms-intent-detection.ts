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
  | 'question'    // Player is asking a question
  | 'unknown';    // Can't determine intent

export type SmsIntentResult = {
  intent: SmsIntent;
  confidence: 'high' | 'medium' | 'low';
  extractedGameCode?: string;  // If they mentioned a game code
  followUpQuestion?: string;   // If we need to ask for clarification
};

// Common patterns we can detect without AI
const ACCEPT_PATTERNS = [
  /^(yes|yep|yeah|yea|ya|yup|sure|ok|okay|k|in|im in|i'm in|count me in|i'll be there|see you there|confirmed|accept|joining|join|down|let's go|lets go|absolutely|definitely|for sure|👍|✅|🎾|🏓)$/i,
];

const DECLINE_PATTERNS = [
  /^(no|nope|nah|can't|cant|cannot|pass|skip|out|i'm out|im out|not this time|maybe next time|decline|busy|unavailable|sorry|❌|👎)$/i,
];

const CANCEL_PATTERNS = [
  /^(cancel|canceling|cancelling|back out|backing out|pull out|pulling out|drop|dropping|remove me|take me out|something came up|can't make it anymore|cant make it)$/i,
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
      prompt: `You are analyzing an SMS reply to a pickleball game invitation.
      
The player received an invite to play pickleball and replied with this message:
"${message}"

Determine their intent. Options:
- "accept" = They want to join the game
- "decline" = They don't want to join
- "cancel" = They previously accepted but now want to back out
- "question" = They're asking for more information
- "unknown" = Can't determine what they want

Also determine confidence (high/medium/low) and if we need to ask a follow-up question.

Respond in JSON format only:
{
  "intent": "accept|decline|cancel|question|unknown",
  "confidence": "high|medium|low",
  "followUpQuestion": "optional question if intent is unclear"
}`,
      output: {
        schema: z.object({
          intent: z.enum(['accept', 'decline', 'cancel', 'question', 'unknown']),
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

