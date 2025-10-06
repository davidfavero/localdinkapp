'use server';

/**
 * @fileOverview A name disambiguation AI agent.
 *
 * - disambiguateName - A function that handles the name disambiguation process.
 * - NameDisambiguationInput - The input type for the disambiguateName function.
 * - NameDisambiguationOutput - The return type for the disambiguateName function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const NameDisambiguationInputSchema = z.object({
  playerName: z
    .string()
    .describe(
      'The name of the player, which may be a full name or just a first name.'
    ),
  knownPlayers: z.array(z.string()).describe('A list of known player full names.'),
});
export type NameDisambiguationInput = z.infer<typeof NameDisambiguationInputSchema>;

const NameDisambiguationOutputSchema = z.object({
  disambiguatedName: z
    .string()
    .optional()
    .describe('The full name of the player, disambiguated from the list of known players.'),
  question: z
    .string()
    .optional()
    .describe("A question to the user for clarification or to add a new player. For example, if a new player should be added, the question should be of the format 'I don't know [Player Name]. To add them to your contacts, please provide their phone number.'"),
});
export type NameDisambiguationOutput = z.infer<typeof NameDisambiguationOutputSchema>;

export async function disambiguateName(
  input: NameDisambiguationInput
): Promise<NameDisambiguationOutput> {
  return disambiguateNameFlow(input);
}

const prompt = ai.definePrompt({
  name: 'nameDisambiguationPrompt',
  input: {schema: NameDisambiguationInputSchema},
  output: {schema: NameDisambiguationOutputSchema},
  prompt: `You are an AI assistant helping to disambiguate player names.

  Given a player name (which may be a first name only) and a list of known player full names, determine the most likely full name of the player.

  - If the player name is a full name and it matches one of the known players, return that full name in 'disambiguatedName'.
  - If the player name is a first name, find the known player whose first name matches the given name. 
    - If there is only one match, return that full name in 'disambiguatedName'.
    - If there are multiple matches, return a question in 'question' asking the user to clarify which player they mean, like "Do you mean Robert Smith or Robert Thomas?".
    - If there are no matches, return a question in 'question' asking for the new player's phone number to add them. The question should be of the format 'I don't know {{{playerName}}}. To add them to your contacts, please provide their phone number.'.

  Player Name: {{{playerName}}}
  Known Players: {{#each knownPlayers}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}
  `,
});

const disambiguateNameFlow = ai.defineFlow(
  {
    name: 'nameDisambiguationFlow',
    inputSchema: NameDisambiguationInputSchema,
    outputSchema: NameDisambiguationOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return {
      disambiguatedName: output?.disambiguatedName,
      question: output?.question,
    };
  }
);
