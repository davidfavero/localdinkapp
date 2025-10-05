'use server';

/**
 * @fileOverview A conversational AI flow for the LocalDink assistant, Robin.
 *
 * - chat - A function that handles conversational chat with the user.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { ChatHistory, ChatInput, ChatInputSchema, ChatOutput, ChatOutputSchema } from '@/lib/types';
import { disambiguateName } from './name-disambiguation';
import { players as knownPlayersData } from '@/lib/data';
import { sendSmsTool } from '../tools/sms';

export async function chat(input: ChatInput): Promise<ChatOutput> {
  const knownPlayers = knownPlayersData.map(p => ({name: p.name, phone: p.phone || ''}));
  const knownPlayerNames = knownPlayers.map(p => p.name);

  // 1. Call the AI to extract structured data from the user's message.
  const { output: extractedDetails } = await ai.generate({
    prompt: `You are Robin, an AI scheduling assistant for a pickleball app called LocalDink. Your primary job is to help users schedule games by extracting details from their messages and having a friendly, brief conversation.

- Your main goal is to extract the players' names, the date, the time, and the location for the game.
- For dates, always convert relative terms like "tomorrow" to an absolute date (today is ${new Date().toDateString()}).
- If a detail is missing, ask a clarifying question.
- If the user's message is not a scheduling request, just have a friendly conversation. In this case, put your full response in the 'confirmationText' field and do not return any other fields.

Conversation History:
${input.history.map((h: ChatHistory) => `- ${h.sender}: ${h.text}`).join('\n')}

New User Message:
- user: ${input.message}
`,
    model: 'googleai/gemini-2.5-flash',
    output: {
      schema: ChatOutputSchema,
    },
    config: {
      temperature: 0.2,
    },
  });

  if (!extractedDetails) {
    return { confirmationText: "I'm sorry, I had trouble understanding that. Could you try again?" };
  }

  // 2. If it was just a conversational response, return it.
  if (extractedDetails.confirmationText) {
    return { confirmationText: extractedDetails.confirmationText };
  }

  const { players, date, time, location } = extractedDetails;

  // 3. If no players were extracted, ask for clarification.
  if (!players || players.length === 0) {
    return { confirmationText: "I'm sorry, I didn't catch who is playing. Could you list the players for the game?" };
  }

  // 4. Disambiguate player names and find their phone numbers.
  const invitedPlayers = await Promise.all(
    players.map(async (playerName) => {
      const result = await disambiguateName({ playerName, knownPlayers: knownPlayerNames });
      const fullName = result.disambiguatedName;
      const playerData = knownPlayers.find(p => p.name === fullName);
      return { name: fullName, phone: playerData?.phone };
    })
  );

  const playersWithPhones = invitedPlayers.filter(p => p.phone);
  const playerNames = invitedPlayers.map(p => p.name);

  // 5. Send SMS invitations if we have everything we need.
  let smsSent = false;
  if (date && time && location && players.length > 0) {
    const smsBody = `Pickleball Game Invitation! You're invited to a game on ${date} at ${time} at ${location}. Respond YES or NO. Manage your profile at https://localdink.app/join`;
    for (const player of playersWithPhones) {
      // In a real app, you might not want to await this to speed up the response,
      // but for now, we'll await to ensure it sends.
      await sendSmsTool({ to: player.phone!, body: smsBody });
    }
    smsSent = true;
  }
  
  // 6. Construct the final confirmation text for the UI.
  let responseText = '';
  if (smsSent) {
     responseText = `Great! I've scheduled the game and sent SMS invitations to: ${playerNames.join(', ')}. Does that look right?`;
  } else {
     let missingInfo = [];
     if (!date) missingInfo.push('date');
     if (!time) missingInfo.push('time');
     if (!location) missingInfo.push('location');
     responseText = `Got it. I have ${playerNames.join(', ')} down. What about the ${missingInfo.join(' and ')}?`;
  }
  

  return { confirmationText: responseText };
}
