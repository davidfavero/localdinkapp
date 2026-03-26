import 'server-only';

import Twilio from 'twilio';

type TwilioConfig = {
  accountSid: string;
  authToken: string;
  fromNumber: string;
};

let cachedClient: Twilio.Twilio | null = null;
let cachedConfig: TwilioConfig | null = null;

function resolveTwilioConfig(): TwilioConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  const missing: string[] = [];
  if (!accountSid) missing.push('TWILIO_ACCOUNT_SID');
  if (!authToken) missing.push('TWILIO_AUTH_TOKEN');
  if (!fromNumber) missing.push('TWILIO_PHONE_NUMBER');

  if (missing.length > 0) {
    throw new Error(
      `Twilio configuration is missing. Please set the following environment variables: ${missing.join(
        ', '
      )}`
    );
  }

  cachedConfig = { accountSid, authToken, fromNumber };
  return cachedConfig;
}

function getTwilioClient(config: TwilioConfig): Twilio.Twilio {
  if (!cachedClient) {
    cachedClient = Twilio(config.accountSid, config.authToken);
  }
  return cachedClient;
}

export function isTwilioConfigured(): boolean {
  try {
    resolveTwilioConfig();
    return true;
  } catch {
    return false;
  }
}

export function normalizeToE164(phone: string | undefined | null): string | null {
  if (!phone) return null;

  const trimmed = phone.trim();
  if (!trimmed) return null;

  if (/^\+\d{10,15}$/.test(trimmed.replace(/\s+/g, ''))) {
    return trimmed.replace(/\s+/g, '');
  }

  const digitsOnly = trimmed.replace(/\D/g, '');

  if (digitsOnly.length === 10) {
    return `+1${digitsOnly}`;
  }

  if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    return `+${digitsOnly}`;
  }

  if (digitsOnly.length >= 10 && digitsOnly.length <= 15) {
    return `+${digitsOnly}`;
  }

  return null;
}

export async function sendSmsMessage({
  to,
  body,
  from,
  maxRetries = 2,
}: {
  to: string;
  body: string;
  from?: string;
  maxRetries?: number;
}) {
  const config = resolveTwilioConfig();
  const client = getTwilioClient(config);

  const sender = from ?? config.fromNumber;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await client.messages.create({
        to,
        from: sender,
        body,
      });
    } catch (error: any) {
      lastError = error;
      const status = error?.status ?? error?.code;
      // Don't retry on client errors (invalid number, etc.) — only on transient/server failures
      if (status && status >= 400 && status < 500) {
        throw error;
      }
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 4000);
        await new Promise(resolve => setTimeout(resolve, delay));
        console.warn(`[twilio] Retry ${attempt + 1}/${maxRetries} for SMS to ${to}`);
      }
    }
  }
  throw lastError;
}

export type TwilioMessageResult = Awaited<ReturnType<typeof sendSmsMessage>>;

