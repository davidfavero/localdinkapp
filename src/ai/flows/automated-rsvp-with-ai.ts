'use server';

/**
 * @fileOverview This file defines a Genkit flow for automatically managing RSVPs and sending confirmations for pickleball game sessions using AI.
 *
 * - automatedRsvpWithAi - A function that triggers the automated RSVP process.
 * - AutomatedRsvpWithAiInput - The input type for the automatedRsvpWithAi function.
 * - AutomatedRsvpWithAiOutput - The return type for the automatedRsvpWithAi function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AutomatedRsvpWithAiInputSchema = z.object({
  gameSessionDetails: z.string().describe('Details of the game session, including date, time, location, and players invited.'),
  responses: z.array(z.object({
    playerName: z.string().describe('Name of the player.'),
    response: z.enum(['yes', 'no', 'maybe']).describe('The player\'s response to the invitation.'),
  })).describe('An array of player responses to the game session invitation.'),
  alternates: z.array(z.string()).optional().describe('An optional array of player names who are alternates.'),
});
export type AutomatedRsvpWithAiInput = z.infer<typeof AutomatedRsvpWithAiInputSchema>;

const AutomatedRsvpWithAiOutputSchema = z.object({
  confirmationList: z.array(z.string()).describe('A list of players who are confirmed for the game session.'),
  notificationMessages: z.array(z.string()).describe('A list of notification messages to be sent to players (e.g., confirmations, alternate invitations).'),
});
export type AutomatedRsvpWithAiOutput = z.infer<typeof AutomatedRsvpWithAiOutputSchema>;

export async function automatedRsvpWithAi(input: AutomatedRsvpWithAiInput): Promise<AutomatedRsvpWithAiOutput> {
  return automatedRsvpWithAiFlow(input);
}

const automatedRsvpPrompt = ai.definePrompt({
  name: 'automatedRsvpPrompt',
  input: {schema: AutomatedRsvpWithAiInputSchema},
  output: {schema: AutomatedRsvpWithAiOutputSchema},
  prompt: `You are Robin, an AI scheduler assistant for pickleball games. You manage RSVPs, send confirmations, and notify alternates as needed.

Here are the game session details:
{{{gameSessionDetails}}}

Here are the player responses:
{{#each responses}}
- {{playerName}}: {{response}}
{{/each}}

{{#if alternates}}
Here are the alternate players available:
{{#each alternates}}
- {{this}}
{{/each}}
{{/if}}

Based on the responses, create a confirmation list and generate appropriate notification messages for each player. Ensure the game has enough players, and if not, notify alternates.

Output the confirmationList containing the names of confirmed players, and the notificationMessages which contains a string for each player being notified, and the content of that notification.`,
});

const automatedRsvpWithAiFlow = ai.defineFlow(
  {
    name: 'automatedRsvpWithAiFlow',
    inputSchema: AutomatedRsvpWithAiInputSchema,
    outputSchema: AutomatedRsvpWithAiOutputSchema,
  },
  async input => {
    const {output} = await automatedRsvpPrompt(input);
    return output!;
  }
);
