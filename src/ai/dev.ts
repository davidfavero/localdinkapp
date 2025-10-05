import { config } from 'dotenv';
config();

import '@/ai/flows/automated-cancellation-management.ts';
import '@/ai/flows/automated-rsvp-with-ai.ts';
import '@/ai/flows/name-disambiguation.ts';
import '@/ai/flows/profile-preference-extraction.ts';
import '@/ai/flows/chat.ts';
import '@/ai/tools/sms.ts';
