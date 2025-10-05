'use server';

/**
 * @fileOverview Manages automated cancellation handling and alternate notification for pickleball games.
 *
 * - handleCancellation - Handles game cancellations and notifies alternates.
 * - HandleCancellationInput - The input type for the handleCancellation function.
 * - HandleCancellationOutput - The return type for the handleCancellation function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { sendSmsTool } from '../tools/sms';

const AlternatePlayerSchema = z.object({
  name: z.string().describe('The name of the alternate player.'),
  phone: z.string().optional().describe('The phone number of the alternate player.'),
});

const HandleCancellationInputSchema = z.object({
  gameSessionId: z.string().describe('The ID of the game session being cancelled.'),
  cancelledPlayerName: z.string().describe('The name of the player who cancelled.'),
  alternates: z.array(AlternatePlayerSchema).describe('An array of alternate players with their names and phone numbers.'),
  originalPlayerNames: z.array(z.string()).describe('An array of names of original players in the game.'),
  courtName: z.string().describe('The name of the court where the game is scheduled.'),
  gameTime: z.string().describe('The time the game is scheduled for.'),
});
export type HandleCancellationInput = z.infer<typeof HandleCancellationInputSchema>;

const HandleCancellationOutputSchema = z.object({
  message: z.string().describe('A message confirming the cancellation and alternate notification.'),
  alternateNotified: z.string().optional().describe('The name of the alternate player who was notified, if any.'),
});
export type HandleCancellationOutput = z.infer<typeof HandleCancellationOutputSchema>;

export async function handleCancellation(input: HandleCancellationInput): Promise<HandleCancellationOutput> {
  return handleCancellationFlow(input);
}

const handleCancellationPrompt = ai.definePrompt({
  name: 'handleCancellationPrompt',
  input: {schema: HandleCancellationInputSchema},
  output: {schema: HandleCancellationOutputSchema},
  tools: [sendSmsTool],
  prompt: `A player has cancelled. Your task is to manage the cancellation and notify an alternate player via SMS.

Game Details:
- Cancelled Player: {{cancelledPlayerName}}
- Game Time: {{gameTime}}
- Location: {{courtName}}
- Original Players: {{#each originalPlayerNames}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}

Available Alternates:
{{#each alternates}}
- Name: {{{name}}}, Phone: {{{phone}}}
{{/each}}

Instructions:
1.  Check if there are any alternates available.
2.  If alternates exist, select the *first* one from the list.
3.  Use the 'sendSmsTool' to send an SMS to that alternate's phone number. The SMS should be friendly and invite them to the game, mentioning the time and location.
4.  Your final response message (for the user in the app) should confirm the cancellation, state which alternate was notified (e.g., "I've sent an SMS to [Alternate's Name] to see if they can fill the spot."), and list the new lineup of players.
5.  If no alternates are available, your final response message should simply state that the player has been removed and that no alternates were available to invite.
`,
});

const handleCancellationFlow = ai.defineFlow(
  {
    name: 'handleCancellationFlow',
    inputSchema: HandleCancellationInputSchema,
    outputSchema: HandleCancellationOutputSchema,
  },
  async input => {
    const {output} = await handleCancellationPrompt(input);
    // Basic logic to determine who was notified. This can be made more sophisticated.
    const alternateNotified = input.alternates.length > 0 ? input.alternates[0].name : undefined;
    return {
      message: output!.message,
      alternateNotified: alternateNotified,
    };
  }
);
