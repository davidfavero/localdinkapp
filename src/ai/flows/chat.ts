'use server';

/**
 * @fileOverview A conversational AI flow for the LocalDink assistant, Robin.
 *
 * - chat - A function that handles conversational chat with the user.
 * - ChatInput - The input type for the chat function.
 * - ChatOutput - The return type for the chat function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

export const ChatInputSchema = z.object({
  message: z.string().describe('The user\'s message.'),
  history: z.array(z.object({
    sender: z.enum(['user', 'robin']),
    text: z.string(),
  })).describe('The conversation history.'),
});
export type ChatInput = z.infer<typeof ChatInputSchema>;

export type ChatOutput = string;

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
