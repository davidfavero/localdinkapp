import 'server-only';

import twilio from 'twilio';

type TwilioConfig = {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  messagingServiceSid?: string;
};

let cachedClient: ReturnType<typeof twilio> | null = null;
let cachedConfig: TwilioConfig | null = null;

function resolveTwilioConfig(): TwilioConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const fromNumber = process.env.TWILIO_PHONE_NUMBER?.trim();
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();

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

  cachedConfig = {
    accountSid: accountSid!,
    authToken: authToken!,
    fromNumber: fromNumber!,
    messagingServiceSid: messagingServiceSid || undefined,
  };
  return cachedConfig;
}

function getTwilioClient(config: TwilioConfig): ReturnType<typeof twilio> {
  if (!cachedClient) {
    cachedClient = twilio(config.accountSid, config.authToken);
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

  // Use Messaging Service SID if available (routes through approved A2P campaign)
  // Otherwise fall back to direct from number
  const messageParams: Record<string, string> = { to, body };
  if (config.messagingServiceSid) {
    messageParams.messagingServiceSid = config.messagingServiceSid;
  } else {
    messageParams.from = from ?? config.fromNumber;
  }

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await client.messages.create(messageParams);
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
