'use server';

/**
 * @fileOverview A conversational AI flow for the LocalDink assistant, Robin.
 *
 * - chat - A function that handles conversational chat with the user.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { ChatInput, ChatInputSchema, ChatOutput } from '@/lib/types';

export async function chat(input: ChatInput): Promise<ChatOutput> {
  return chatFlow(input);
}

const chatPrompt = ai.definePrompt({
  name: 'chatPrompt',
  input: { schema: ChatInputSchema },
  prompt: `You are Robin, a friendly and helpful AI assistant for a pickleball scheduling app called LocalDink. Your goal is to have a natural conversation and help users schedule games, find players, or answer questions about the app.

  Keep your responses concise and friendly.

  Conversation History:
  {{#each history}}
  - {{sender}}: {{text}}
  {{/each}}
  
  New User Message:
  - user: {{{message}}}

  Your Response:
  - robin:`,
});

const chatFlow = ai.defineFlow(
  {
    name: 'chatFlow',
    inputSchema: ChatInputSchema,
    outputSchema: z.string(),
  },
  async (input) => {
    const { text } = await ai.generate({
      prompt: {
        template: chatPrompt.prompt,
        input: input,
      },
      model: 'googleai/gemini-2.5-flash',
      config: {
        // Lower temperature for more predictable, less creative responses
        temperature: 0.5,
      },
    });

    return text;
  }
);
