'use server';

/**
 * @fileOverview A tool for sending SMS messages using Twilio.
 *
 * - sendSmsTool - A Genkit tool that sends an SMS message.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import Twilio from 'twilio';

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
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !from) {
      const missingVars = [];
      if (!accountSid) missingVars.push('TWILIO_ACCOUNT_SID');
      if (!authToken) missingVars.push('TWILIO_AUTH_TOKEN');
      if (!from) missingVars.push('TWILIO_PHONE_NUMBER');
      
      const errorMsg = `Twilio configuration is missing. Please set the following environment variables: ${missingVars.join(', ')}`;
      console.error(errorMsg);
      return {
        success: false,
        error: errorMsg,
      };
    }

    const client = Twilio(accountSid, authToken);

    try {
      console.log(`Sending SMS from: ${from}, to: ${to}`);
      const message = await client.messages.create({
        body,
        from,
        to,
      });
      console.log('SMS sent successfully, SID:', message.sid);
      return { success: true, messageSid: message.sid };
    } catch (error: any) {
      console.error('Failed to send SMS via Twilio:', error.message);
      return { success: false, error: `Twilio Error: ${error.message}` };
    }
  }
);
