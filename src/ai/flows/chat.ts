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


export async function chat(input: ChatInput, knownPlayers: Player[]): Promise<ChatOutput> {
    const knownPlayerNames = knownPlayers.map(p => `${p.firstName} ${p.lastName}`);
    const currentUser = knownPlayers.find(p => p.isCurrentUser);
    
    let processedInput = input.message;
    const historyToConsider = input.history.slice(-4); // Only consider last 4 messages

    // If the user's message is a simple confirmation, we need to look at the history
    // to reinvoke the flow with the details Robin was asking to confirm.
    if (isConfirmation(input.message) && historyToConsider.length > 0) {
      const lastRobinMessage = historyToConsider.filter(h => h.sender === 'robin').pop();
      if (lastRobinMessage) {
          processedInput = `confirming: ${lastRobinMessage.text}`;
      }
    }


    // 1. Call the AI to extract structured data from the user's message.
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
    
    // Merge details from history if confirming
    if (isConfirmation(input.message)) {
      const lastBotMessage = historyToConsider.filter(h => h.sender === 'robin').pop()?.text || '';
      // A simple regex to pull details from the bot's last question
      const playersMatch = lastBotMessage.match(/game for (.*?)( at| on)/);
      if (playersMatch && (!extractedDetails.players || extractedDetails.players.length === 0)) {
        extractedDetails.players = playersMatch[1].split(' and ').map(name => name.replace('You', 'me'));
      }
    }


    // 2. If it was just a conversational response, return it.
    if (extractedDetails.confirmationText && !extractedDetails.players && !extractedDetails.date && !extractedDetails.time && !extractedDetails.location) {
      return { confirmationText: extractedDetails.confirmationText };
    }

    const { players, date, time, location } = extractedDetails;

    // 3. If no players were extracted, ask for clarification.
    if (!players || players.length === 0) {
      return { confirmationText: "I'm sorry, I didn't catch who is playing. Could you list the players for the game?" };
    }

    // 4. Disambiguate player names and find their phone numbers.
    const invitedPlayers = (await Promise.all(
      players.map(async (playerName) => {
        // A simple "me" or "i" in this context should resolve to the current user.
        if (['me', 'i', 'myself'].includes(playerName.toLowerCase().trim()) && currentUser) {
             return { id: currentUser?.id, name: `${currentUser.firstName} ${currentUser.lastName}`, phone: currentUser?.phone };
        }
        const result = await disambiguateName({ playerName, knownPlayers: knownPlayerNames });
        const fullName = result.disambiguatedName;
        const playerData = knownPlayers.find(p => `${p.firstName} ${p.lastName}` === fullName);
        return { id: playerData?.id, name: fullName, phone: playerData?.phone };
      })
    )).reduce((acc, player) => {
      // Remove duplicates
      if (player.id && !acc.some(p => p.id === player.id)) {
        acc.push(player);
      } else if (!player.id && !acc.some(p => p.name === player.name)) {
        acc.push(player);
      }
      return acc;
    }, [] as { id?: string; name: string; phone?: string }[]);
    
    // This is passed back to the action to handle SMS and DB writes
    extractedDetails.invitedPlayers = invitedPlayers;
    extractedDetails.currentUser = currentUser;

    const playerNames = invitedPlayers.map(p => p.id === currentUser?.id ? 'You' : p.name);

    // 5. Formulate the response text
    let responseText = '';
    if (date && time && location && players.length > 0) {
       responseText = `Great! I'll schedule a game for ${playerNames.join(' and ')} at ${location} on ${date} at ${time}. Does that look right?`;
    } else {
      // If not enough info to send SMS yet, ask for it.
      let missingInfo = [];
      if (!date) missingInfo.push('date');
      if (!time) missingInfo.push('time');
      if (!location) missingInfo.push('location');
      
      responseText = `Got it! I'll schedule a game for ${playerNames.join(' and ')}. I just need to confirm the ${missingInfo.join(' and ')}. What's the plan?`;
    }
    
    return { ...extractedDetails, confirmationText: responseText };
  }
    
