'use server';

/**
 * @fileOverview A profile preference extraction AI agent.
 *
 * - extractProfilePreferences - A function that handles the extraction of user profile preferences for pickleball game scheduling.
 * - ProfilePreferenceExtractionInput - The input type for the extractProfilePreferences function.
 * - ProfilePreferenceExtractionOutput - The return type for the extractProfilePreferences function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ProfilePreferenceExtractionInputSchema = z.object({
  profileText: z
    .string()
    .describe(
      'A text description of the user profile, including preferences for doubles, home courts, and availability.'
    ),
});
export type ProfilePreferenceExtractionInput = z.infer<
  typeof ProfilePreferenceExtractionInputSchema
>;

const ProfilePreferenceExtractionOutputSchema = z.object({
  doublesPreference: z
    .boolean()
    .describe('Whether the user prefers doubles games.'),
  homeCourtPreference: z
    .string()
    .describe('The user preferred home court name.'),
  availability: z
    .string()
    .describe(
      'The user availability for games, including days of the week and times.'
    ),
});
export type ProfilePreferenceExtractionOutput = z.infer<
  typeof ProfilePreferenceExtractionOutputSchema
>;

export async function extractProfilePreferences(
  input: ProfilePreferenceExtractionInput
): Promise<ProfilePreferenceExtractionOutput> {
  return profilePreferenceExtractionFlow(input);
}

const prompt = ai.definePrompt({
  name: 'profilePreferenceExtractionPrompt',
  input: {schema: ProfilePreferenceExtractionInputSchema},
  output: {schema: ProfilePreferenceExtractionOutputSchema},
  prompt: `You are an AI agent specializing in extracting user profile preferences for pickleball game scheduling.

  Analyze the following user profile text and extract the user preferences for doubles, home courts, and availability. Make a determination based on the text and set the corresponding output fields appropriately.

  Profile Text: {{{profileText}}}
  
  Ensure that homeCourtPreference and availability are strings. If the information is not available, set the fields to 'not specified'.`,
});

const profilePreferenceExtractionFlow = ai.defineFlow(
  {
    name: 'profilePreferenceExtractionFlow',
    inputSchema: ProfilePreferenceExtractionInputSchema,
    outputSchema: ProfilePreferenceExtractionOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);

