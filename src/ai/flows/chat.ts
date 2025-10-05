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
    prompt: `You are Robin, an AI scheduling assistant. Your job is to extract scheduling details from the user's message.
- Extract the players' names, the date, the time, and the location for the game.
- For dates, convert relative terms like "tomorrow" to an absolute date (today is ${new Date().toDateString()}).
- If a location is not specified, you can leave it blank.
- If the user's message is not a scheduling request, just have a friendly conversation and put your response in the 'confirmationText' field.

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

  // 5. Send SMS invitations.
  const smsBody = `Game invitation! You're invited to a pickleball game on ${date || 'a date to be determined'} at ${time || 'a time to be determined'} at ${location || 'a court to be determined'}. Respond YES or NO. Manage your profile at https://localdink.app/join`;
  for (const player of playersWithPhones) {
    await sendSmsTool({ to: player.phone!, body: smsBody });
  }
  
  // 6. Construct the final confirmation text for the UI.
  const response = `Great! I'll schedule a game for ${date || 'a yet to be determined date'} at ${time || 'a yet to be determined time'} at ${location || 'your home court'}. I have sent SMS invitations to: ${playerNames.join(', ')}. Does that look right?`;

  return { confirmationText: response };
}
