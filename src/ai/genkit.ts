/**
 * Genkit AI configuration for LocalDink
 * Uses Google AI (Gemini) models
 */

import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

// Check if we have the API key
const apiKey = process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn('[genkit] GOOGLE_GENAI_API_KEY or GEMINI_API_KEY not found. AI features will be disabled.');
}

// Create the model reference using googleAI.model()
export const geminiFlash = apiKey ? googleAI.model('gemini-2.0-flash') : null;

// Configure Genkit with Google AI
export const ai = apiKey ? genkit({
  plugins: [
    googleAI({
      apiKey,
    }),
  ],
}) : {
  // Fallback implementation when API key is missing - provides helpful user feedback
  async generate(_: any) {
    console.warn('[genkit] AI backend is disabled - GOOGLE_GENAI_API_KEY or GEMINI_API_KEY not configured.');
    // Return a helpful message instead of null so users know what's wrong
    return { 
      output: {
        confirmationText: "I'm sorry, but the AI service is not configured yet. Please add your Google AI (Gemini) API key to the .env.local file as GOOGLE_GENAI_API_KEY to enable Robin.",
      }
    };
  },
  definePrompt: (_config: any) => async (_input: any) => ({ 
    output: {
      confirmationText: "AI service is not configured. Please add GOOGLE_GENAI_API_KEY to .env.local.",
    }
  }),
  defineFlow: (_config: any, _handler?: any) => async (_input: any) => null,
  // Return a callable function that executes the handler directly (bypassing AI)
  defineTool: (_config: any, handler?: any) => {
    const toolFn = async (input: any) => {
      if (handler) {
        try {
          return await handler(input);
        } catch (error: any) {
          console.error(`[genkit] Tool ${_config.name} error:`, error);
          return { error: error.message || 'Tool execution failed' };
        }
      }
      console.warn(`[genkit] Tool ${_config.name} called without handler - returning empty result`);
      return {};
    };
    // Add name property so it can still be used as a tool reference
    (toolFn as any).name = _config.name;
    return toolFn;
  },
};
