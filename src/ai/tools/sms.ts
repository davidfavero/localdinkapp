/**
 * @fileOverview A tool for sending SMS messages using Telnyx.
 *
 * - sendSmsTool - A Genkit tool that sends an SMS message.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { normalizeToE164, sendSmsMessage } from '@/server/telnyx';

const SendSmsSchema = z.object({
  to: z.string().describe("The recipient's phone number."),
  body: z.string().describe('The content of the message.'),
});

export const sendSmsTool = ai.defineTool(
  {
    name: 'sendSmsTool',
    description: 'Sends an SMS message to a specified phone number.',
    inputSchema: SendSmsSchema,
    outputSchema: z.object({
      success: z.boolean(),
      messageSid: z.string().optional(),
      error: z.string().optional(),
    }),
  },
  async ({ to, body }) => {
    const normalizedTo = normalizeToE164(to);
    if (!normalizedTo) {
      const errorMsg = `The phone number "${to}" is not a valid SMS destination. Please use a full number (e.g., +18885551234).`;
      console.error(errorMsg);
      return {
        success: false,
        error: errorMsg,
      };
    }

    try {
      console.log(`Sending SMS to: ${normalizedTo}`);
      const message = await sendSmsMessage({
        body,
        to: normalizedTo,
      });
      console.log('SMS sent successfully, ID:', message?.id);
      return { success: true, messageSid: message?.id ?? 'unknown' };
    } catch (error: any) {
      console.error('Failed to send SMS via Telnyx:', error.message);
      return { success: false, error: `Telnyx Error: ${error.message}` };
    }
  }
);
