'use server';

/**
 * @fileOverview A conversational AI flow for the LocalDink assistant, Robin.
 *
 * - chat - A function that handles conversational chat with the user.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { ChatHistory, ChatInput, ChatInputSchema, ChatOutput, ChatOutputSchema, Player } from '@/lib/types';
import { disambiguateName } from './name-disambiguation';

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


export async function chat(knownPlayers: Player[], input: ChatInput): Promise<ChatOutput> {
    const knownPlayerNames = knownPlayers.map(p => `${p.firstName} ${p.lastName}`);
    const currentUser = knownPlayers.find(p => p.isCurrentUser);
    
    let processedInput = input.message;
    const historyToConsider = input.history.slice(-4); // Only consider last 4 messages
    const lastRobinMessage = historyToConsider.filter(h => h.sender === 'robin').pop();

    if (isConfirmation(input.message) && lastRobinMessage) {
      processedInput = `confirming: ${lastRobinMessage.text}`;
    } else if (isPhoneNumber(input.message) && lastRobinMessage && lastRobinMessage.text.includes('phone number')) {
        // Find the user's last message BEFORE the current one (which is the phone number).
        // This should be the original request.
        const lastUserMessage = historyToConsider.filter(h => h.sender === 'user' && !isPhoneNumber(h.text)).pop();
        if (lastUserMessage) {
            // Re-run the initial request with the new phone number appended.
             processedInput = `${lastUserMessage.text} (and the phone number for the new person is ${input.message})`;
        }
    }

    const { output: extractedDetails } = await ai.generate({
      prompt: `You are Robin, an AI scheduling assistant for a pickleball app called LocalDink. Your primary job is to help users schedule games by extracting details from their messages and having a friendly, brief conversation.

- Your main goal is to extract the players' names, the date, the time, and the location for the game.
- Players: ALWAYS return a list of all player full names mentioned in the 'players' field. This is critical.
- Dates: Always convert relative terms like "tomorrow" to an absolute date (today is ${new Date().toDateString()}).
- If a detail is missing, ask a clarifying question.
- If the user asks to be notified about player responses (e.g., "let me know if Alex responds"), acknowledge this in your 'confirmationText' (e.g., "Got it! I'll let you know when Alex responds."). This is important for user reassurance.
- If the user's message is not a scheduling request, just have a friendly conversation. In this case, put your full response in the 'confirmationText' field and do not return any other fields.

Conversation History:
${historyToConsider.map((h: ChatHistory) => `- ${h.sender}: ${h.text}`).join('\n')}

New User Message:
- user: ${processedInput}
`,
      model: 'googleai/gemini-2.5-flash',
      output: {
        schema: ChatOutputSchema,
      },
      config: {
        temperature: 0.1,
      },
    });

    if (!extractedDetails) {
      return { confirmationText: "I'm sorry, I had trouble understanding that. Could you try again?" };
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

    if (extractedDetails.confirmationText && !extractedDetails.players && !extractedDetails.date && !extractedDetails.time && !extractedDetails.location) {
      return { confirmationText: extractedDetails.confirmationText };
    }

    const { players, date, time, location } = extractedDetails;

    if (!players || players.length === 0) {
      return { confirmationText: "I'm sorry, I didn't catch who is playing. Could you list the players for the game?" };
    }

    const disambiguationResults = await Promise.all(
      players.map(async (playerName) => {
        if (['me', 'i', 'myself'].includes(playerName.toLowerCase().trim()) && currentUser) {
          return { id: currentUser.id, name: `${currentUser.firstName} ${currentUser.lastName}`, phone: currentUser.phone, originalName: playerName, disambiguatedName: `${currentUser.firstName} ${currentUser.lastName}` };
        }
        const result = await disambiguateName({ playerName, knownPlayers: knownPlayerNames });
        return { ...result, originalName: playerName, name: result.disambiguatedName };
      })
    );
    
    const questions = disambiguationResults.map(r => r.question).filter(q => q);
    if (questions.length > 0) {
      return { confirmationText: questions.join(' ') };
    }

    const invitedPlayers = disambiguationResults.map(result => {
        if (result.question) return null; // Skip if there's a question
        
        const fullName = result.disambiguatedName;
        if (!fullName) return null;

        const playerData = knownPlayers.find(p => `${p.firstName} ${p.lastName}` === fullName);
        return { id: playerData?.id, name: fullName, phone: playerData?.phone };

    }).filter((p): p is { id?: string; name: string; phone?: string } => p !== null);

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

    let responseText = '';
    if (date && time && location && uniqueInvitedPlayers.length > 0) {
       responseText = `Great! I'll schedule a game for ${formattedPlayerNames} at ${location} on ${date} at ${time}. Does that look right?`;
    } else if (uniqueInvitedPlayers.length > 0) {
      let missingInfo = [];
      if (!date) missingInfo.push('date');
      if (!time) missingInfo.push('time');
      if (!location) missingInfo.push('location');
      
      responseText = `Got it! I'll schedule a game for ${formattedPlayerNames}. I just need to confirm the ${missingInfo.join(' and ')}. What's the plan?`;
    } else {
        // This case should now be rare due to the checks above, but it's a safe fallback.
        responseText = "I'm sorry, I couldn't figure out who to invite. Could you list the players again?";
    }
    
    // Handle the user's request to be notified
    if (input.message.toLowerCase().includes('let me know if') && extractedDetails.players) {
      const mentionedPlayer = extractedDetails.players.find(p => p.toLowerCase() !== 'me');
      if(mentionedPlayer) {
        responseText = `Got it! I'll let you know as soon as ${mentionedPlayer} responds.`;
      }
    }

    return { ...extractedDetails, confirmationText: responseText };
  }
    
