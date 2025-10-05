'use server';

import { z } from 'zod';
import { extractProfilePreferences, ProfilePreferenceExtractionInput, ProfilePreferenceExtractionOutput } from "@/ai/flows/profile-preference-extraction";
import { handleCancellation, HandleCancellationInput, HandleCancellationOutput } from "@/ai/flows/automated-cancellation-management";
import { chat } from "@/ai/flows/chat";

export const ChatInputSchema = z.object({
  message: z.string().describe("The user's message."),
  history: z.array(z.object({
    sender: z.enum(['user', 'robin']),
    text: z.string(),
  })).describe('The conversation history.'),
});
export type ChatInput = z.infer<typeof ChatInputSchema>;

export type ChatOutput = string;


export async function extractPreferencesAction(
  input: ProfilePreferenceExtractionInput
): Promise<ProfilePreferenceExtractionOutput> {
  try {
    const result = await extractProfilePreferences(input);
    return result;
  } catch (error) {
    console.error("Error in extractPreferencesAction:", error);
    // In a real app, you'd want more robust error handling
    throw new Error("Failed to extract preferences with AI.");
  }
}

export async function handleCancellationAction(
  input: HandleCancellationInput
): Promise<HandleCancellationOutput> {
  try {
    const result = await handleCancellation(input);
    return result;
  } catch (error) {
    console.error("Error in handleCancellationAction:", error);
    throw new Error("Failed to handle cancellation with AI.");
  }
}

export async function chatAction(input: ChatInput): Promise<ChatOutput> {
  try {
    const result = await chat(input);
    return result;
  } catch (error) {
    console.error("Error in chatAction:", error);
    throw new Error("Failed to get response from AI.");
  }
}
