import 'server-only';

import Telnyx from 'telnyx';

type TelnyxConfig = {
  apiKey: string;
  fromNumber: string;
};

let cachedClient: Telnyx | null = null;
let cachedConfig: TelnyxConfig | null = null;

function resolveTelnyxConfig(): TelnyxConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const apiKey = process.env.TELNYX_API_KEY?.trim();
  const fromNumber = process.env.TELNYX_PHONE_NUMBER?.trim();

  const missing: string[] = [];
  if (!apiKey) missing.push('TELNYX_API_KEY');
  if (!fromNumber) missing.push('TELNYX_PHONE_NUMBER');

  if (missing.length > 0) {
    throw new Error(
      `Telnyx configuration is missing. Please set the following environment variables: ${missing.join(
        ', '
      )}`
    );
  }

  cachedConfig = { apiKey: apiKey!, fromNumber: fromNumber! };
  return cachedConfig;
}

function getTelnyxClient(config: TelnyxConfig): Telnyx {
  if (!cachedClient) {
    cachedClient = new Telnyx({ apiKey: config.apiKey });
  }
  return cachedClient;
}

export function isTelnyxConfigured(): boolean {
  try {
    resolveTelnyxConfig();
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
  const config = resolveTelnyxConfig();
  const client = getTelnyxClient(config);

  const sender = from ?? config.fromNumber;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.messages.send({
        to,
        from: sender,
        text: body,
      });
      return response.data;
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
        console.warn(`[telnyx] Retry ${attempt + 1}/${maxRetries} for SMS to ${to}`);
      }
    }
  }
  throw lastError;
}

export type TelnyxMessageResult = Awaited<ReturnType<typeof sendSmsMessage>>;
