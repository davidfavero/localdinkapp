'use server';

import { extractProfilePreferences, ProfilePreferenceExtractionInput, ProfilePreferenceExtractionOutput } from "@/ai/flows/profile-preference-extraction";
import { handleCancellation, HandleCancellationInput, HandleCancellationOutput } from "@/ai/flows/automated-cancellation-management";

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
