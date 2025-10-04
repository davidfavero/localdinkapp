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

const HandleCancellationInputSchema = z.object({
  gameSessionId: z.string().describe('The ID of the game session being cancelled.'),
  cancelledPlayerName: z.string().describe('The name of the player who cancelled.'),
  alternatePlayerNames: z.array(z.string()).describe('An array of names of alternate players who can fill the spot.'),
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
  prompt: `{{cancelledPlayerName}} has cancelled from the pickleball game scheduled for {{gameTime}} at {{courtName}}.\n\nOriginal Players: {{#each originalPlayerNames}}{{{this}}}, {{/each}}\nAlternates: {{#each alternatePlayerNames}}{{{this}}}, {{/each}}\n\nNotify an alternate to fill the spot using the sendSmsTool. The phone number for the alternate is not available, so use a placeholder like "555-555-5555". Respond to the other players about this cancellation.  If no alternates are available, inform the other players that the spot cannot be filled.  If there are no alternates, respond with no alternate player.  The alternate will be notified via SMS.
\nMake sure to include the new list of players in the response. If an alternate is added, make sure to include them in the list.  Do not include the cancelled player in the new list.\n\nFinal Answer:`,
});

const handleCancellationFlow = ai.defineFlow(
  {
    name: 'handleCancellationFlow',
    inputSchema: HandleCancellationInputSchema,
    outputSchema: HandleCancellationOutputSchema,
  },
  async input => {
    const {output} = await handleCancellationPrompt(input);
    // Basic logic to determine who was notified.  This can be made more sophisticated.
    const alternateNotified = input.alternatePlayerNames.length > 0 ? input.alternatePlayerNames[0] : undefined;
    return {
      message: output!.message,
      alternateNotified: alternateNotified,
    };
  }
);
