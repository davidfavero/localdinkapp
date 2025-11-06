/**
 * Temporary no-op Genkit facade used during local development. The real
 * Genkit + Google AI stack relies on native bindings that are not available
 * in the SSR build and crash the Next.js compiler. By exporting a stub with
 * the same surface area we keep the rest of the code paths working (they fall
 * back to friendly copy when `output` is null) without blocking the app.
 */

type GenerateArgs = {
  prompt: string;
  model?: string;
  output?: unknown;
  config?: unknown;
};

// No-op function that returns a callable that returns null output
function noopPrompt(_config: any) {
  return async (_input: any) => ({ output: null });
}

// No-op function that returns a callable that returns null output
function noopFlow(_config: any, _handler?: any) {
  return async (_input: any) => null;
}

export const ai = {
  async generate(_: GenerateArgs) {
    console.warn('[genkit] AI backend is disabled in this environment.');
    return { output: null };
  },
  definePrompt: noopPrompt,
  defineFlow: noopFlow,
};
