'use server';

/**
 * @fileOverview A conversational AI flow for the LocalDink assistant, Robin.
 *
 * Robin's Core Function: Schedule pickleball games by extracting players, dates, times, and courts
 * from natural language and creating game sessions.
 *
 * - chat - A function that handles conversational chat with the user.
 */

import { ai, geminiFlash } from '@/ai/genkit';
import { z } from 'zod';
import { ChatHistory, ChatInput, ChatInputSchema, ChatOutput, ChatOutputSchema, Player, Group, Court } from '@/lib/types';
import { disambiguateName } from './name-disambiguation';
import { createGameSessionTool } from '@/ai/tools/create-game-session';

const APP_TIME_ZONE = 'America/New_York';

function getCurrentAppDate(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: APP_TIME_ZONE }));
}

// ============================================================================
// REGEX-BASED EXTRACTION HELPERS (Fallback when AI misses details)
// ============================================================================

/**
 * Extract date from natural language (e.g., "December 25", "tomorrow", "this Thursday")
 */
function extractDateFromText(text: string): string | null {
  const lower = text.toLowerCase();
  const today = getCurrentAppDate();
  
  // "today"
  if (/\btoday\b/.test(lower)) {
    return formatDate(today);
  }
  
  // "tomorrow"
  if (/\btomorrow\b/.test(lower)) {
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    return formatDate(tomorrow);
  }
  
  // Day of week: "this Thursday", "on Friday", "Thursday"
  const dayMatch = lower.match(/\b(this\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  if (dayMatch) {
    const dayName = dayMatch[2].toLowerCase();
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetDay = days.indexOf(dayName);
    const currentDay = today.getDay();
    let daysUntil = (targetDay - currentDay + 7) % 7;
    if (daysUntil === 0) daysUntil = 7; // Next week if same day
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + daysUntil);
    return formatDate(targetDate);
  }
  
  // Explicit date: "December 25", "Dec 25", "December 25th", "12/25", "25th of December"
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const monthAbbrevs = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  
  // "December 25" or "Dec 25" or "December 25th"
  const monthDayMatch = lower.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[.,]?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if (monthDayMatch) {
    const monthStr = monthDayMatch[1].toLowerCase();
    const day = parseInt(monthDayMatch[2]);
    let monthIndex = monthNames.indexOf(monthStr);
    if (monthIndex === -1) monthIndex = monthAbbrevs.indexOf(monthStr);
    if (monthIndex !== -1 && day >= 1 && day <= 31) {
      const year = today.getMonth() > monthIndex ? today.getFullYear() + 1 : today.getFullYear();
      return formatDate(new Date(year, monthIndex, day));
    }
  }
  
  // "25th of December" pattern
  const dayOfMonthMatch = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i);
  if (dayOfMonthMatch) {
    const day = parseInt(dayOfMonthMatch[1]);
    const monthStr = dayOfMonthMatch[2].toLowerCase();
    let monthIndex = monthNames.indexOf(monthStr);
    if (monthIndex === -1) monthIndex = monthAbbrevs.indexOf(monthStr);
    if (monthIndex !== -1 && day >= 1 && day <= 31) {
      const year = today.getMonth() > monthIndex ? today.getFullYear() + 1 : today.getFullYear();
      return formatDate(new Date(year, monthIndex, day));
    }
  }
  
  // MM/DD or MM/DD/YYYY format
  const slashDateMatch = lower.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slashDateMatch) {
    const month = parseInt(slashDateMatch[1]) - 1;
    const day = parseInt(slashDateMatch[2]);
    let year = slashDateMatch[3] ? parseInt(slashDateMatch[3]) : today.getFullYear();
    if (year < 100) year += 2000;
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return formatDate(new Date(year, month, day));
    }
  }
  
  return null;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/**
 * Extract time from natural language (e.g., "11am", "3:30 PM", "at 2")
 */
function extractTimeFromText(text: string): string | null {
  const lower = text.toLowerCase();
  
  // "11am", "11 am", "11:00am", "11:00 AM", "3:30pm"
  const timeMatch = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)\b/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1]);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    const period = timeMatch[3].replace(/\./g, '').toUpperCase();
    return `${hours}:${minutes.toString().padStart(2, '0')} ${period}`;
  }
  
  // "at 2", "at 3" - assume PM for typical game times
  const atTimeMatch = lower.match(/\bat\s+(\d{1,2})(?!\d|:|\s*(am|pm))/i);
  if (atTimeMatch) {
    const hours = parseInt(atTimeMatch[1]);
    // Assume PM for hours 1-9, AM for 10-12
    const period = hours >= 1 && hours <= 9 ? 'PM' : (hours >= 10 && hours <= 11 ? 'AM' : 'PM');
    return `${hours}:00 ${period}`;
  }
  
  // "noon" / "midday"
  if (/\b(noon|midday)\b/.test(lower)) {
    return '12:00 PM';
  }
  
  return null;
}

/**
 * Extract court/location from text using fuzzy matching against known courts
 */
function extractLocationFromText(text: string, knownCourts: Court[]): { location: string; matchedCourt: Court | null } | null {
  const lower = text.toLowerCase();
  
  // Try to match known courts first
  for (const court of knownCourts) {
    const courtNameLower = court.name.toLowerCase();
    const courtNameClean = courtNameLower.replace(/['''`]/g, '').replace(/\s*(courts?|tennis|center|park|club)$/i, '').trim();
    
    // Check if court name appears in text
    if (lower.includes(courtNameLower) || lower.includes(courtNameClean)) {
      return { location: court.name, matchedCourt: court };
    }
    
    // Check for partial matches (e.g., "ion" for "I'On Courts")
    const words = courtNameClean.split(/\s+/);
    for (const word of words) {
      if (word.length >= 3 && lower.includes(word)) {
        return { location: court.name, matchedCourt: court };
      }
    }
  }
  
  // Look for "at [location]" pattern
  const atLocationMatch = lower.match(/\bat\s+(?:the\s+)?([a-z][a-z0-9'\s]+?)(?:\s+(?:courts?|on|at|with|tomorrow|today|this|next|\d)|\s*[.,!?]|$)/i);
  if (atLocationMatch) {
    const locationCandidate = atLocationMatch[1].trim();
    // Make sure it's not a time or date
    if (!/(am|pm|\d{1,2}:\d{2}|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(locationCandidate)) {
      // Try to match against known courts
      for (const court of knownCourts) {
        const courtClean = court.name.toLowerCase().replace(/['''`]/g, '').replace(/\s*(courts?|tennis|center|park|club)$/i, '').trim();
        const candidateClean = locationCandidate.replace(/['''`]/g, '').replace(/\s*(courts?|tennis|center|park|club)$/i, '').trim();
        if (courtClean.includes(candidateClean) || candidateClean.includes(courtClean)) {
          return { location: court.name, matchedCourt: court };
        }
      }
      return { location: locationCandidate, matchedCourt: null };
    }
  }
  
  return null;
}

/**
 * Extract player names from text
 */
function extractPlayersFromText(text: string, knownPlayers: Player[]): string[] {
  const players: string[] = [];
  const lower = text.toLowerCase();
  
  // Always add "me" if it's a scheduling request
  const schedulingKeywords = ['schedule', 'book', 'setup', 'set up', 'create', 'game', 'play', 'session'];
  const isScheduling = schedulingKeywords.some(k => lower.includes(k));
  if (isScheduling) {
    players.push('me');
  }
  
  // Check for "with [name]" or "and [name]" patterns  
  // Also match full names in the text
  for (const player of knownPlayers) {
    if (player.isCurrentUser) continue; // Skip current user, we handle "me" separately
    
    const fullName = `${player.firstName} ${player.lastName}`.toLowerCase();
    const firstName = player.firstName.toLowerCase();
    
    // Check for full name
    if (lower.includes(fullName)) {
      players.push(`${player.firstName} ${player.lastName}`);
      continue;
    }
    
    // Check for first name in context of "with" or "and"
    const withPattern = new RegExp(`\\b(with|and)\\s+${firstName}\\b`, 'i');
    if (withPattern.test(lower)) {
      players.push(`${player.firstName} ${player.lastName}`);
    }
  }
  
  return [...new Set(players)]; // Remove duplicates
}

// Helper to match a group by name
function findGroupByName(searchName: string, groups: (Group & { id: string })[]): (Group & { id: string }) | undefined {
  const normalized = searchName.toLowerCase().trim();
  
  // Exact match
  const exactMatch = groups.find(g => g.name.toLowerCase().trim() === normalized);
  if (exactMatch) return exactMatch;
  
  // Partial match (search term is in group name or vice versa)
  const partialMatch = groups.find(g => {
    const groupName = g.name.toLowerCase().trim();
    return groupName.includes(normalized) || normalized.includes(groupName);
  });
  if (partialMatch) return partialMatch;
  
  // Word match (any significant word matches)
  const words = normalized.split(/\s+/).filter(w => w.length > 2);
  const wordMatch = groups.find(g => {
    const groupWords = g.name.toLowerCase().split(/\s+/);
    return words.some(w => groupWords.includes(w));
  });
  
  return wordMatch;
}

// Helper to match a court by name (case-insensitive, flexible matching)
function findCourtByName(searchName: string, courts: Court[]): Court | undefined {
  if (!searchName || !courts.length) return undefined;
  
  // Helper to create a "clean" version for matching - removes apostrophes, special chars, and common suffixes
  const cleanForMatching = (str: string) => {
    return str
      .toLowerCase()
      .trim()
      .replace(/['''`]/g, '')  // Remove all apostrophe variations
      .replace(/\s+/g, '')     // Remove ALL spaces for matching
      .replace(/(courts?|tennis|center|park|club|the)$/gi, '') // Remove suffixes
      .replace(/^(the)/gi, '') // Remove prefix "the"
      .trim();
  };
  
  // Also create a version that keeps spaces but normalizes them
  const normalizeSpaces = (str: string) => {
    return str
      .toLowerCase()
      .trim()
      .replace(/['''`]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s*(courts?|tennis|center|park|club)$/gi, '')
      .trim();
  };

  const searchNormalized = searchName.toLowerCase().trim();
  const searchCleaned = cleanForMatching(searchName);
  const searchSpaced = normalizeSpaces(searchName);

  console.log(`[findCourt] Searching for: "${searchName}"`);
  console.log(`[findCourt]   normalized: "${searchNormalized}", cleaned: "${searchCleaned}", spaced: "${searchSpaced}"`);
  console.log('[findCourt] Available courts:', courts.map(c => `"${c.name}" (cleaned: "${cleanForMatching(c.name)}")`));

  // Try exact match first (case insensitive)
  let match = courts.find(c => c.name.toLowerCase().trim() === searchNormalized);
  if (match) {
    console.log(`[findCourt] Found exact match: "${match.name}"`);
    return match;
  }

  // Try cleaned match (removes apostrophes, spaces, and suffixes: "I'On Courts" matches "ion courts" matches "ION")
  match = courts.find(c => cleanForMatching(c.name) === searchCleaned);
  if (match) {
    console.log(`[findCourt] Found cleaned match: "${match.name}"`);
    return match;
  }
  
  // Try spaced match (keeps structure but normalizes)
  match = courts.find(c => normalizeSpaces(c.name) === searchSpaced);
  if (match) {
    console.log(`[findCourt] Found spaced match: "${match.name}"`);
    return match;
  }

  // If no exact match, try partial/contains match
  match = courts.find(c => {
    const courtCleaned = cleanForMatching(c.name);
    return courtCleaned.includes(searchCleaned) || searchCleaned.includes(courtCleaned);
  });
  if (match) {
    console.log(`[findCourt] Found partial match: "${match.name}"`);
    return match;
  }

  // Try starts-with match
  match = courts.find(c => {
    const courtCleaned = cleanForMatching(c.name);
    return courtCleaned.startsWith(searchCleaned) || searchCleaned.startsWith(courtCleaned);
  });
  if (match) {
    console.log(`[findCourt] Found starts-with match: "${match.name}"`);
    return match;
  }
  
  // Last resort: check if any word in the search matches any word in court names
  const searchWords = searchCleaned.split(/\s+/).filter(w => w.length > 2);
  if (searchWords.length > 0) {
    match = courts.find(c => {
      const courtCleaned = cleanForMatching(c.name);
      return searchWords.some(word => courtCleaned.includes(word) || word.includes(courtCleaned));
    });
    if (match) {
      console.log(`[findCourt] Found word match: "${match.name}"`);
      return match;
    }
  }

  console.log(`[findCourt] No court found matching "${searchName}"`);
  return undefined;
}

// Helper function to check if a message is a simple confirmation
function isConfirmation(message: string) {
  const lowerMessage = message.toLowerCase().trim();
  return ['yes', 'yep', 'yeah', 'ok', 'okay', 'sounds good', 'confirm', 'do it', 'try again', 'i did, yes.'].includes(lowerMessage);
}

// Helper function to check if a message is just a phone number
function isPhoneNumber(message: string) {
    // This is a simple regex for US-style phone numbers, allowing for optional formatting.
    const phoneRegex = /^(?:\+?1\s?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}\s?[\s.-]?\d{4}$/;
    return phoneRegex.test(message.trim());
}


// Helper to format a list of names naturally
function formatPlayerNames(names: string[]): string {
    if (names.length === 0) return '';
    if (names.length === 1) return names[0];
    if (names.length === 2) return names.join(' and ');
    return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
};

// Helper to parse date and time into a Date object
// Returns an ISO string that represents the intended LOCAL time (assumes US Eastern timezone)
function parseDateTime(dateStr: string, timeStr: string): Date | null {
  try {
    // Get current app date in Eastern timezone for reference
    const easternNow = getCurrentAppDate();
    
    let year = easternNow.getFullYear();
    let month = easternNow.getMonth();
    let day = easternNow.getDate();
    
    // Handle relative dates
    const lowerDate = dateStr.toLowerCase();
    if (lowerDate.includes('tomorrow')) {
      day += 1;
      // Handle month/year rollover
      const tempDate = new Date(year, month, day);
      year = tempDate.getFullYear();
      month = tempDate.getMonth();
      day = tempDate.getDate();
    } else if (!lowerDate.includes('today')) {
      // Try to parse the date string
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        year = parsed.getFullYear();
        month = parsed.getMonth();
        day = parsed.getDate();
      }
    }

    // Parse time string (e.g., "4:00 PM", "4pm", "16:00")
    let hours = 17; // Default to 5 PM
    let minutes = 0;
    
    const timeMatch = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM|am|pm)?/i);
    if (timeMatch) {
      hours = parseInt(timeMatch[1]);
      minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const period = timeMatch[3]?.toUpperCase();

      if (period === 'PM' && hours !== 12) {
        hours += 12;
      } else if (period === 'AM' && hours === 12) {
        hours = 0;
      }
    }

    // Create date in Eastern timezone by constructing the ISO string manually
    // This ensures 4pm Eastern is stored as 4pm Eastern, not converted from UTC
    const monthStr = String(month + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const hoursStr = String(hours).padStart(2, '0');
    const minutesStr = String(minutes).padStart(2, '0');
    
    // Calculate Eastern timezone offset (EST is -5, EDT is -4)
    // We'll use a date in the target month to determine if DST is in effect
    const targetDate = new Date(year, month, day);
    const jan = new Date(year, 0, 1);
    const jul = new Date(year, 6, 1);
    const stdOffset = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
    const isDST = targetDate.getTimezoneOffset() < stdOffset;
    
    // For Eastern: EST = -05:00, EDT = -04:00
    // But since we want the stored time to represent the local time, we use the offset
    const offsetHours = isDST ? 4 : 5;
    
    // Create ISO string with Eastern timezone offset
    const isoString = `${year}-${monthStr}-${dayStr}T${hoursStr}:${minutesStr}:00.000-0${offsetHours}:00`;
    
    console.log(`[parseDateTime] Parsed "${dateStr}" + "${timeStr}" => ${isoString}`);
    
    return new Date(isoString);
  } catch (error) {
    console.error('Error parsing date/time:', error);
    return null;
  }
}


export async function chat(
  knownPlayers: Player[], 
  input: ChatInput, 
  knownGroups: (Group & { id: string })[] = [],
  knownCourts: Court[] = []
): Promise<ChatOutput> {
    const knownPlayerNames = knownPlayers.map(p => `${p.firstName} ${p.lastName}`);
    const knownGroupNames = knownGroups.map(g => g.name);
    const knownCourtNames = knownCourts.map(c => c.name);
    const currentUser = knownPlayers.find(p => p.isCurrentUser);
    
    console.log('[chat] Available groups:', knownGroupNames);
    console.log('[chat] Available courts:', knownCourtNames);
    
    const historyToConsider = input.history.slice(-6); // Consider last 6 messages for better context
    const lastRobinMessage = historyToConsider.filter(h => h.sender === 'robin').pop();
    const currentMessageText = input.message.trim();
    const currentMessagePlayers = extractPlayersFromText(currentMessageText, knownPlayers);
    const shouldUseCurrentMessageForPlayers =
      !isConfirmation(currentMessageText) &&
      !isPhoneNumber(currentMessageText) &&
      currentMessagePlayers.length > 0;

    // ========================================================================
    // STEP 1: Gather ALL text from conversation (current + history) for extraction
    // ========================================================================
    const allUserMessages = shouldUseCurrentMessageForPlayers
      ? [currentMessageText]
      : [
          ...historyToConsider.filter((h) => h.sender === 'user').map((h) => h.text),
          currentMessageText,
        ];
    const combinedText = allUserMessages.join(' '); // All user text combined for regex extraction
    
    console.log('[chat] Combined user text for extraction:', combinedText);

    // ========================================================================
    // STEP 2: Run REGEX extraction FIRST (reliable, deterministic)
    // ========================================================================
    const regexDate = extractDateFromText(combinedText);
    const regexTime = extractTimeFromText(combinedText);
    const regexLocation = extractLocationFromText(combinedText, knownCourts);
    const regexPlayers = shouldUseCurrentMessageForPlayers
      ? currentMessagePlayers
      : extractPlayersFromText(combinedText, knownPlayers);
    
    console.log('[chat] Regex extraction results:', {
      date: regexDate,
      time: regexTime,
      location: regexLocation?.location || null,
      matchedCourt: regexLocation?.matchedCourt?.name || null,
      players: regexPlayers,
    });

    // Build the message to send to the AI
    let processedInput = input.message;
    
    // Preprocess common scheduling phrases to make them clearer
    const lowerInput = processedInput.toLowerCase();
    if (lowerInput.includes('book a time') || lowerInput.includes('book time')) {
      processedInput = processedInput.replace(/book\s+a?\s*time/gi, 'schedule a game');
    }
    if (lowerInput.includes('set up') || lowerInput.includes('setup')) {
      processedInput = processedInput.replace(/set\s+up/gi, 'schedule');
    }

    if (isConfirmation(input.message) && lastRobinMessage) {
      processedInput = `[User is confirming] Previous Robin message: "${lastRobinMessage.text}". User says: "${input.message}"`;
    } else if (isPhoneNumber(input.message) && lastRobinMessage && lastRobinMessage.text.includes('phone number')) {
        // Find the user's last message BEFORE the current one (which is the phone number).
        // This should be the original request.
        const lastUserMessage = historyToConsider.filter(h => h.sender === 'user' && !isPhoneNumber(h.text)).pop();
        if (lastUserMessage) {
            // Re-run the initial request with the new phone number appended.
             processedInput = `${lastUserMessage.text} (and the phone number for the new person is ${input.message})`;
        }
    }

    const today = getCurrentAppDate();
    const todayFormatted = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    // Calculate day of week dates for better relative date parsing
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayDayIndex = today.getDay();
    const dayDates: Record<string, string> = {};
    for (let i = 0; i < 7; i++) {
      const futureDate = new Date(today);
      const daysUntil = (i - todayDayIndex + 7) % 7 || 7; // Next occurrence (or 7 if today)
      futureDate.setDate(today.getDate() + daysUntil);
      dayDates[daysOfWeek[i].toLowerCase()] = futureDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }
    // Tomorrow
    const tomorrowDate = new Date(today);
    tomorrowDate.setDate(today.getDate() + 1);
    const tomorrowFormatted = tomorrowDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    // ========================================================================
    // STEP 3: Call AI for additional extraction and natural language response
    // ========================================================================
    let extractedDetails: ChatOutput | null = null;
    try {
      console.log('[AI] Starting generation for message:', processedInput.substring(0, 100));
      
      const result = await ai.generate({
        prompt: `You are Robin, a pickleball scheduling assistant. Your ONLY job is to extract scheduling details from user messages.

## CRITICAL: EXTRACT EVERYTHING IN ONE PASS

When user says: "setup a game on December 25 at 11am with David Favero at ION courts"
You MUST return:
- players: ["David Favero", "me"]  
- date: "December 25, 2025"
- time: "11:00 AM"
- location: "ION"

NEVER ask for information the user already provided!

## TODAY'S DATE
Today is ${todayFormatted}. Tomorrow is ${tomorrowFormatted}.

## AVAILABLE DATA
- Known players: ${knownPlayerNames.join(', ') || 'none'}
- Known courts: ${knownCourtNames.join(', ') || 'none'}
${knownGroupNames.length > 0 ? `- Groups: ${knownGroupNames.join(', ')}` : ''}

## CONVERSATION HISTORY
${historyToConsider.map((h: ChatHistory) => `${h.sender.toUpperCase()}: ${h.text}`).join('\n')}

## CURRENT MESSAGE
${processedInput}

## EXTRACTION REQUIREMENTS

**Players**: Always include "me" (the current user) when scheduling. Extract all other names mentioned.

**Date**: Convert to "Month Day, Year" format.
- "tomorrow" → "${tomorrowFormatted}"
- "December 25" or "Dec 25" → "December 25, ${today.getFullYear()}"
- "Thursday" → "${dayDates['thursday']}"

**Time**: Convert to "H:MM AM/PM" format.
- "11am" → "11:00 AM"
- "3pm" or "at 3" → "3:00 PM"

**Location**: Match to known courts if possible. Look for court names like "${knownCourtNames.slice(0, 3).join('", "')}"

## OUTPUT
Extract ALL details from ALL messages in the conversation. Check both history AND current message.
If you have all details, set confirmationText to summarize what you're scheduling.
Only ask a question if something is genuinely missing from ALL messages.`,
        model: geminiFlash!,
        output: {
          schema: ChatOutputSchema,
        },
        config: {
          temperature: 0.05, // Very low temperature for deterministic extraction
        },
      });
      console.log('[AI] Generation result:', result ? 'success' : 'null', result?.output ? 'has output' : 'no output');
      extractedDetails = result?.output || null;
    } catch (aiError: any) {
      console.error('AI generation error:', aiError);
      
      // Check for quota exceeded error
      const errorMessage = aiError?.message || '';
      if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('Too Many Requests')) {
        return {
          confirmationText: `I've hit my API rate limit for the moment. Please wait about 30 seconds and try again. If this keeps happening, check your Google AI billing at ai.google.dev.`
        };
      }
      
      // Use regex extraction as fallback when AI fails
      console.log('[chat] AI failed, using regex fallback');
      extractedDetails = {
        players: regexPlayers.length > 0 ? regexPlayers : null,
        date: regexDate,
        time: regexTime,
        location: regexLocation?.location || null,
        confirmationText: null,
      };
    }

    // ========================================================================
    // STEP 4: MERGE regex and AI results (regex takes precedence for reliability)
    // ========================================================================
    if (!extractedDetails) {
      extractedDetails = {
        players: null,
        date: null,
        time: null,
        location: null,
        confirmationText: null,
      };
    }
    
    // CRITICAL: Use regex results to fill in ANY gaps from AI extraction
    // This ensures we never lose information that was clearly stated
    if (regexDate && !extractedDetails.date) {
      console.log('[chat] Using regex date:', regexDate);
      extractedDetails.date = regexDate;
    }
    if (regexTime && !extractedDetails.time) {
      console.log('[chat] Using regex time:', regexTime);
      extractedDetails.time = regexTime;
    }
    if (regexLocation && !extractedDetails.location) {
      console.log('[chat] Using regex location:', regexLocation.location);
      extractedDetails.location = regexLocation.location;
    }
    if (regexPlayers.length > 0 && (!extractedDetails.players || extractedDetails.players.length === 0)) {
      console.log('[chat] Using regex players:', regexPlayers);
      extractedDetails.players = regexPlayers;
    }
    if (shouldUseCurrentMessageForPlayers && currentMessagePlayers.length > 0) {
      // Explicit names in a new user request should override stale conversation carry-over.
      extractedDetails.players = currentMessagePlayers;
    }
    
    // Also check if regex found better/more complete data even if AI found something
    if (regexDate && extractedDetails.date && regexDate !== extractedDetails.date) {
      // Prefer the more specific date (the one with a year if both don't have one)
      console.log(`[chat] Date conflict: regex="${regexDate}" vs AI="${extractedDetails.date}", using regex`);
      extractedDetails.date = regexDate;
    }
    if (regexTime && extractedDetails.time && regexTime !== extractedDetails.time) {
      console.log(`[chat] Time conflict: regex="${regexTime}" vs AI="${extractedDetails.time}", using regex`);
      extractedDetails.time = regexTime;
    }
    // For location, prefer matched court from regex
    if (regexLocation?.matchedCourt && extractedDetails.location) {
      console.log(`[chat] Using regex matched court: "${regexLocation.matchedCourt.name}"`);
      extractedDetails.location = regexLocation.matchedCourt.name;
    }
    
    console.log('[chat] Merged extraction results:', {
      players: extractedDetails.players,
      date: extractedDetails.date,
      time: extractedDetails.time,
      location: extractedDetails.location,
    });
    
    // If the user just said "yes", re-extract players from the last bot message if the AI missed it.
    if (isConfirmation(input.message)) {
      const lastBotMessage = historyToConsider.filter(h => h.sender === 'robin').pop()?.text || '';
      const playersMatch = lastBotMessage.match(/game for (.*?)( at| on)/);
      if (playersMatch && (!extractedDetails.players || extractedDetails.players.length === 0)) {
        // Handle "You" and split names by ", " or " and "
        extractedDetails.players = playersMatch[1].split(/, | and /).map(name => name.replace('You', 'me'));
      }
    }

    // If it's just a conversational response with no scheduling details, return it
    if (extractedDetails.confirmationText && !extractedDetails.players && !extractedDetails.date && !extractedDetails.time && !extractedDetails.location) {
      return { confirmationText: extractedDetails.confirmationText };
    }

    let { players, date, time, location } = extractedDetails;

    // Ensure we have at least one player (the user themselves if no one else mentioned)
    if (!players || players.length === 0) {
      // Check if the message contains scheduling keywords but no players
      const schedulingKeywords = ['book', 'schedule', 'game', 'time', 'session', 'play'];
      const hasSchedulingIntent = schedulingKeywords.some(keyword => 
        processedInput.toLowerCase().includes(keyword)
      );
      
      if (hasSchedulingIntent) {
        // If it's clearly a scheduling request but no players mentioned, assume it's just the user
        players = ['me'];
        extractedDetails.players = players;
      } else {
        return { confirmationText: "I'm sorry, I didn't catch who is playing. Could you list the players for the game? For example: 'Schedule a game with Melissa tomorrow at 4pm'." };
      }
    }

    // Process each name - could be a player OR a group
    const allResults: { id?: string; name: string; phone?: string; question?: string; isGroup?: boolean; groupName?: string }[] = [];
    const questions: string[] = [];
    const unknownPlayersList: { name: string; suggestedEmail?: string; suggestedPhone?: string }[] = [];
    
    for (const playerName of (players || [])) {
      const trimmedName = playerName.toLowerCase().trim();
      
      // Check if it's "me" / "I" / "myself"
      if (['me', 'i', 'myself'].includes(trimmedName) && currentUser) {
        allResults.push({ 
          id: currentUser.id, 
          name: `${currentUser.firstName} ${currentUser.lastName}`, 
          phone: currentUser.phone 
        });
        continue;
      }
      
      // Check if it's a group name
      const matchedGroup = findGroupByName(playerName, knownGroups);
      if (matchedGroup) {
        console.log(`[chat] Found group "${matchedGroup.name}" with ${matchedGroup.members?.length || 0} members`);
        
        // Expand group to all its members
        if (matchedGroup.members && matchedGroup.members.length > 0) {
          for (const memberId of matchedGroup.members) {
            const memberPlayer = knownPlayers.find(p => p.id === memberId);
            if (memberPlayer) {
              allResults.push({
                id: memberPlayer.id,
                name: `${memberPlayer.firstName} ${memberPlayer.lastName}`,
                phone: memberPlayer.phone,
                isGroup: true,
                groupName: matchedGroup.name,
              });
            }
          }
        }
        continue;
      }
      
      // Otherwise, try to disambiguate as a player name
      const result = await disambiguateName({ playerName, knownPlayers: knownPlayerNames });
      if (result.question) {
        // Check if this is an "unknown player" question
        if (result.question.includes("don't know") || result.question.includes("To add them")) {
          // Track this as an unknown player
          unknownPlayersList.push({ name: playerName });
        }
        questions.push(result.question);
      } else if (result.disambiguatedName) {
        const playerData = knownPlayers.find(p => `${p.firstName} ${p.lastName}` === result.disambiguatedName);
        allResults.push({ 
          id: playerData?.id, 
          name: result.disambiguatedName, 
          phone: playerData?.phone 
        });
      }
    }
    
    // Store unknown players for the UI to offer adding them
    if (unknownPlayersList.length > 0) {
      extractedDetails.unknownPlayers = unknownPlayersList;
    }
    
    if (questions.length > 0) {
      return { ...extractedDetails, confirmationText: questions.join(' ') };
    }

    const invitedPlayers: { id?: string; name: string; phone?: string }[] = allResults.filter(r => r.name && !r.question);

    const uniqueInvitedPlayers = invitedPlayers.reduce((acc, player) => {
      if (player.name && !acc.some(p => p.name === player.name)) {
        acc.push(player);
      }
      return acc;
    }, [] as { id?: string; name: string; phone?: string }[]);
    
    extractedDetails.invitedPlayers = uniqueInvitedPlayers;
    extractedDetails.currentUser = currentUser;

    const playerNames = uniqueInvitedPlayers.map(p => p.id === currentUser?.id ? 'You' : p.name);
    const formattedPlayerNames = formatPlayerNames(playerNames);

    // Find court if location is mentioned - use client-provided courts for reliable matching
    let courtId: string | null = null;
    let courtName: string | null = null;
    if (location && currentUser) {
      const matchedCourt = findCourtByName(location, knownCourts);
      if (matchedCourt) {
        courtId = matchedCourt.id;
        courtName = matchedCourt.name;
        console.log(`[chat] Matched court: "${location}" -> "${courtName}" (id: ${courtId})`);
      } else {
        console.log(`[chat] No court found for: "${location}"`);
      }
    }

    // Check if we have all details to create the session (no confirmation needed)
    const hasAllDetails = date && time && courtId && uniqueInvitedPlayers.length > 0;

    // If we have all details, create the game session immediately - no confirmation needed
    if (hasAllDetails && currentUser) {
      try {
        // Parse date and time into ISO string
        const dateTime = parseDateTime(date, time);
        if (!dateTime) {
          return { 
            confirmationText: "I'm sorry, I had trouble parsing the date and time. Could you try again with a clearer format?" 
          };
        }

        // Build attendees array - determine correct source for each player
        // Players with isCurrentUser or email are from 'users' collection
        // Others are from 'players' collection (contacts)
        const attendees = [
          { id: currentUser.id, source: 'user' as const },
          ...uniqueInvitedPlayers
            .filter(p => p.id && p.id !== currentUser.id)
            .map(p => {
              // Find the full player data to check if they're a user or contact
              const fullPlayer = knownPlayers.find(kp => kp.id === p.id);
              // If they have an email, they're likely a registered user
              const isUser = fullPlayer?.email && fullPlayer.email.length > 0;
              return { id: p.id!, source: isUser ? 'user' as const : 'player' as const };
            }),
        ];

        // Build player statuses
        const playerStatuses: Record<string, 'CONFIRMED' | 'DECLINED' | 'PENDING'> = {
          [currentUser.id]: 'CONFIRMED',
        };
        uniqueInvitedPlayers
          .filter(p => p.id && p.id !== currentUser.id)
          .forEach(p => {
            if (p.id) playerStatuses[p.id] = 'PENDING';
          });

        // Determine if doubles (default to true if 4+ players, false if 2 players)
        const totalPlayers = attendees.length;
        const isDoubles = totalPlayers >= 4;

        const createResult = await createGameSessionTool({
          courtId,
          organizerId: currentUser.id,
          startTime: dateTime.toISOString(),
          isDoubles,
          playerIds: attendees.map(a => a.id),
          attendees,
          playerStatuses,
          durationMinutes: 120,
        });

        if (createResult.success) {
          const notifiedMsg = createResult.notifiedCount && createResult.notifiedCount > 0
            ? ` I've sent SMS invitations to ${createResult.notifiedCount} player${createResult.notifiedCount === 1 ? '' : 's'}.`
            : '';
          const failedTexts = (createResult.skippedPlayers || []).filter(
            (item: { playerId: string; reason: string }) => item.reason !== 'Duplicate phone number'
          );
          const skippedMsg = failedTexts.length > 0
            ? ` I could not send SMS to ${failedTexts.length} player${failedTexts.length === 1 ? '' : 's'} (${failedTexts
                .slice(0, 2)
                .map((item: { playerId: string; reason: string }) => item.reason)
                .join('; ')}).`
            : '';
          return {
            confirmationText: `Perfect! I've scheduled the game for ${formattedPlayerNames} at ${courtName} on ${date} at ${time}.${notifiedMsg}${skippedMsg} You can view it in your Game Sessions.`,
          };
        } else {
          return {
            confirmationText: `I'm sorry, I had trouble creating the game session. ${createResult.error || 'Please try again.'}`,
          };
        }
      } catch (error: any) {
        console.error('Error creating game session:', error);
        return {
          confirmationText: "I'm sorry, I encountered an error while creating the game session. Please try again.",
        };
      }
    }

    // If we got here, it means we couldn't create the session (missing courtId or some details)
    // Build a response that acknowledges what we DO have and asks ONLY for what's missing
    
    // ========================================================================
    // STEP 7: Generate smart response - acknowledge known info, ask only for missing
    // ========================================================================
    let responseText = '';
    
    // Collect what we have vs what we need
    const haveDetails: string[] = [];
    const needDetails: string[] = [];
    
    if (uniqueInvitedPlayers.length > 0) {
      haveDetails.push(`playing with ${formattedPlayerNames}`);
    } else {
      needDetails.push('who will be playing');
    }
    
    if (date) {
      haveDetails.push(`on ${date}`);
    } else {
      needDetails.push('what date');
    }
    
    if (time) {
      haveDetails.push(`at ${time}`);
    } else {
      needDetails.push('what time');
    }
    
    if (courtId && courtName) {
      haveDetails.push(`at ${courtName}`);
    } else if (location && !courtId) {
      // We have a location name but couldn't find the court in user's courts
      // Flag this as an unknown court so the UI can offer to add it
      extractedDetails.unknownCourt = {
        name: location,
        suggestedLocation: '', // Could be extracted from context if available
      };
      responseText = `I found all the details - ${formattedPlayerNames} on ${date || 'a date'} at ${time || 'a time'}. However, I couldn't find a court called "${location}" in your saved courts. Would you like me to add it?`;
    } else {
      needDetails.push('which court');
    }
    
    // Build response based on what's missing
    if (!responseText) {
      if (needDetails.length === 0) {
        // This shouldn't happen if hasAllDetails was properly checked, but handle it
        responseText = `I have all the details but something went wrong. Let me try again - ${haveDetails.join(', ')}.`;
      } else if (needDetails.length === 1) {
        // Only one thing missing - acknowledge what we have
        if (haveDetails.length > 0) {
          responseText = `Got it - ${haveDetails.join(', ')}. ${needDetails[0].charAt(0).toUpperCase() + needDetails[0].slice(1)}?`;
        } else {
          responseText = `${needDetails[0].charAt(0).toUpperCase() + needDetails[0].slice(1)}?`;
        }
      } else {
        // Multiple things missing
        if (haveDetails.length > 0) {
          responseText = `Got it - ${haveDetails.join(', ')}. I still need ${needDetails.slice(0, -1).join(', ')} and ${needDetails[needDetails.length - 1]}.`;
        } else {
          responseText = `I'd be happy to help schedule a game! Can you tell me ${needDetails.slice(0, -1).join(', ')} and ${needDetails[needDetails.length - 1]}?`;
        }
      }
    }
    
    // Handle the user's request to be notified
    if (input.message.toLowerCase().includes('let me know if') && extractedDetails.players && extractedDetails.players.length > 0) {
      const mentionedPlayer = extractedDetails.players.find((p: string) => p.toLowerCase() !== 'me');
      if(mentionedPlayer) {
        responseText = `Got it! I'll let you know as soon as ${mentionedPlayer} responds.`;
      }
    }

    console.log('[chat] Final response:', responseText);
    console.log('[chat] Have:', haveDetails);
    console.log('[chat] Need:', needDetails);

    return { ...extractedDetails, confirmationText: responseText };
  }
    
