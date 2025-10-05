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

export async function chat(input: ChatInput): Promise<ChatOutput> {
  const knownPlayers = knownPlayersData.map(p => p.name);

  const { players, date, time, location, confirmationText } = await chatFlow(input);

  if (confirmationText) {
    return { confirmationText };
  }
  
  if (!players || players.length === 0) {
    return { confirmationText: "I'm sorry, I didn't catch who is playing. Could you list the players for the game?" };
  }

  // Disambiguate player names
  const disambiguatedPlayers = await Promise.all(
    players.map(async (player) => {
      const result = await disambiguateName({ playerName: player, knownPlayers });
      return result.disambiguatedName;
    })
  );
  
  const response = `Great! I'll schedule a game for ${date || 'a yet to be determined date'} at ${time || 'a yet to be determined time'} at ${location || 'your home court'}. I will invite: ${disambiguatedPlayers.join(', ')}. Does that look right?`;

  return { confirmationText: response };
}


const chatFlow = ai.defineFlow(
  {
    name: 'chatFlow',
    inputSchema: ChatInputSchema,
    outputSchema: ChatOutputSchema,
  },
  async (input) => {
    const { output } = await ai.generate({
      prompt: `You are Robin, an AI scheduling assistant who manages pickleball game invitations. Your job is to extract scheduling details from the user's message.

- Extract the players' names, the date, the time, and the location for the game.
- For dates, convert relative terms like "tomorrow" to an absolute date (today is ${new Date().toDateString()}).
- If a location is not specified, you can leave it blank.
- If the user's message is not a scheduling request, just have a friendly conversation and put your response in the 'confirmationText' field.
- If you have extracted details, DO NOT generate a confirmation text. The calling function will do that. Just return the extracted details.

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

    return output!;
  }
);
