'use server';

/**
 * @fileOverview A conversational AI flow for the LocalDink assistant, Robin.
 *
 * - chat - A function that handles conversational chat with the user.
 */

import { ai, geminiFlash } from '@/ai/genkit';
import { z } from 'zod';
import { ChatHistory, ChatInput, ChatInputSchema, ChatOutput, ChatOutputSchema, Player, Group, Court } from '@/lib/types';
import { disambiguateName } from './name-disambiguation';
import { createGameSessionTool } from '@/ai/tools/create-game-session';

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
    // Get current date in Eastern timezone for reference
    const nowEastern = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    const easternNow = new Date(nowEastern);
    
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
    
    let processedInput = input.message;
    const historyToConsider = input.history.slice(-6); // Consider last 6 messages for better context
    const lastRobinMessage = historyToConsider.filter(h => h.sender === 'robin').pop();

    // Preprocess common scheduling phrases to make them clearer
    const lowerInput = processedInput.toLowerCase();
    if (lowerInput.includes('book a time') || lowerInput.includes('book time')) {
      processedInput = processedInput.replace(/book\s+a?\s*time/gi, 'schedule a game');
    }
    if (lowerInput.includes('set up') || lowerInput.includes('setup')) {
      processedInput = processedInput.replace(/set\s+up/gi, 'schedule');
    }

    // Build context from all previous user messages for continuity
    const previousUserMessages = historyToConsider.filter(h => h.sender === 'user').map(h => h.text);
    
    // ALWAYS include previous context - the AI needs this to understand follow-ups
    const fullContext = previousUserMessages.length > 0 
      ? `Previous messages from user: [${previousUserMessages.join('] [')}]\nCurrent message: ${input.message}`
      : input.message;

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
    } else {
      // ALWAYS include full context so AI can merge details from previous messages
      processedInput = fullContext;
    }

    const today = new Date();
    const todayFormatted = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    let extractedDetails;
    try {
      console.log('[AI] Starting generation for message:', processedInput.substring(0, 100));
      
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
      
      const result = await ai.generate({
        prompt: `You are Robin, a friendly AI scheduling assistant for LocalDink, a pickleball app.

**YOUR #1 RULE: EXTRACT EVERY DETAIL FROM THE USER'S MESSAGE IN ONE PASS.**

When a user says "book a game Thursday at 3pm with David Favero at the ion courts", you MUST extract:
- players: ["David Favero", "me"]
- date: "${dayDates['thursday']}"
- time: "3:00 PM"
- location: "ion courts" (or best match from available courts)

DO NOT respond with just "Got it - You. What location?" when location was already mentioned!
DO NOT lose context from previous messages!
DO NOT ask for information the user already provided!

**TODAY'S DATE INFO:**
- Today is: ${todayFormatted} (${daysOfWeek[todayDayIndex]})
- Tomorrow: ${tomorrowFormatted}
- This Thursday: ${dayDates['thursday']}
- This Friday: ${dayDates['friday']}
- This Saturday: ${dayDates['saturday']}
- This Sunday: ${dayDates['sunday']}

**AVAILABLE DATA:**
${knownPlayerNames.length > 0 ? `- Players you know: ${knownPlayerNames.join(', ')}` : '- No players loaded yet'}
${knownGroupNames.length > 0 ? `- Groups: ${knownGroupNames.join(', ')}` : ''}
${knownCourtNames.length > 0 ? `- Courts: ${knownCourtNames.join(', ')}` : '- No courts loaded yet'}

**EXTRACTION RULES:**

1. **PLAYERS** - Extract ALL names mentioned. Always add "me" if user is scheduling.
   - "with David Favero" → ["David Favero", "me"]
   - "with melissa and john" → ["melissa", "john", "me"]
   - "for me" or "I want to play" → ["me"]

2. **DATE** - Convert to "Month Day, Year" format:
   - "tomorrow" → "${tomorrowFormatted}"
   - "thursday" or "this thursday" → "${dayDates['thursday']}"
   - "friday" → "${dayDates['friday']}"
   - Always include the year!

3. **TIME** - Convert to "H:MM AM/PM" format:
   - "3pm" → "3:00 PM"
   - "3:30" → "3:30 PM" (assume PM for times like 3:30)
   - "at 2" → "2:00 PM" (assume PM for afternoon times)

4. **LOCATION** - Extract court/venue name (normalize variations):
   - "ion courts" or "i'on courts" or "ion" → "ION" or "I'On" (match available courts)
   - "at the park" → "park"
   - Be flexible with apostrophes and spelling!

**MERGING CONTEXT:**
If previous messages contain details not in the current message, MERGE them:
- Previous: "schedule with David at 3pm" (has player, time)
- Current: "ion courts" (has location)
- Result: Extract ALL: players=["David", "me"], time="3:00 PM", location="ion courts"

**WHEN TO ASK QUESTIONS:**
Only ask if something is TRULY missing after checking ALL messages:
- If no date mentioned anywhere → ask for date
- If no time mentioned anywhere → ask for time
- If no location mentioned anywhere → ask for location
- If no players mentioned → ask who's playing

NEVER ask for something that was already mentioned!

**CONVERSATION HISTORY:**
${historyToConsider.map((h: ChatHistory) => `${h.sender.toUpperCase()}: ${h.text}`).join('\n')}

**CURRENT REQUEST:**
${processedInput}

Extract ALL details from the messages above. Be thorough!`,
        model: geminiFlash!,
        output: {
          schema: ChatOutputSchema,
        },
        config: {
          temperature: 0.1,
        },
      });
      console.log('[AI] Generation result:', result ? 'success' : 'null', result?.output ? 'has output' : 'no output');
      extractedDetails = result?.output;
    } catch (aiError: any) {
      console.error('AI generation error:', aiError);
      console.error('AI error details:', {
        message: aiError?.message,
        code: aiError?.code,
        stack: aiError?.stack,
        name: aiError?.name,
      });
      
      // Check for quota exceeded error
      const errorMessage = aiError?.message || '';
      if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('Too Many Requests')) {
        return {
          confirmationText: `I've hit my API rate limit for the moment. Please wait about 30 seconds and try again. If this keeps happening, check your Google AI billing at ai.google.dev.`
        };
      }
      
      // Return a helpful error message
      return {
        confirmationText: `I'm having trouble connecting to the AI service right now. Please try again in a moment. If the problem persists, check that the Google AI API key is configured correctly.`
      };
    }

    if (!extractedDetails) {
      // Try a fallback extraction with a simpler approach
      console.error('AI extraction returned null for message:', processedInput);
      return { confirmationText: "I'm sorry, I had trouble understanding that. Could you try rephrasing? For example: 'Schedule a game with [player name] tomorrow at 4pm at [court name]'?" };
    }
    
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
    
    if (questions.length > 0) {
      return { confirmationText: questions.join(' ') };
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
          return {
            confirmationText: `Perfect! I've scheduled the game for ${formattedPlayerNames} at ${courtName} on ${date} at ${time}.${notifiedMsg} You can view it in your Game Sessions.`,
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
    // Ask only for what's genuinely missing
    let responseText = '';
    if (uniqueInvitedPlayers.length > 0) {
      let missingInfo = [];
      if (!date) missingInfo.push('date');
      if (!time) missingInfo.push('time');
      if (!location && !courtId) missingInfo.push('location');
      else if (location && !courtId) {
        // We have a location name but couldn't find the court
        responseText = `I couldn't find a court called "${location}". Could you check the name or add it to your courts first?`;
      }
      
      if (!responseText && missingInfo.length > 0) {
        responseText = `Got it - ${formattedPlayerNames}. What ${missingInfo.join(' and ')}?`;
      } else if (!responseText) {
        // We have players but something else went wrong
        responseText = `I have the details but couldn't create the session. Please try again or check your courts.`;
      }
    } else {
        // This case should now be rare due to the checks above, but it's a safe fallback.
        responseText = "Who's playing?";
    }
    
    // Handle the user's request to be notified
    if (input.message.toLowerCase().includes('let me know if') && extractedDetails.players && extractedDetails.players.length > 0) {
      const mentionedPlayer = extractedDetails.players.find((p: string) => p.toLowerCase() !== 'me');
      if(mentionedPlayer) {
        responseText = `Got it! I'll let you know as soon as ${mentionedPlayer} responds.`;
      }
    }

    return { ...extractedDetails, confirmationText: responseText };
  }
    
