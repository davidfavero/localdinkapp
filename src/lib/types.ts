import { z } from 'zod';
import type { Timestamp } from 'firebase/firestore';

export type Player = {
  id: string;
  name?: string; // Keep for fallback, but prefer firstName/lastName
  avatarUrl: string;
  phone?: string;
  isCurrentUser?: boolean; 
  firstName: string;
  lastName: string;
  email: string;
  dinkRating?: string;
  doublesPreference?: boolean;
  homeCourtId?: string;
  availability?: string;
  ownerId?: string; // User who created this player contact
  linkedUserId?: string; // Links to a registered user account (if email/phone matches)
};

export type Court = {
  id: string;
  name: string;
  location: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  isHome?: boolean;
  isFavorite?: boolean;
  ownerId: string; // User who created this court
};

export type Group = {
  id: string;
  name: string;
  description?: string;
  avatarUrl: string;
  members: string[]; // Array of user IDs
  ownerId: string; // Primary owner/organizer
  admins: string[]; // Array of admin user IDs (can manage the group)
  homeCourtId?: string; // Default court for this group
};

export type AttendeeSource = 'user' | 'player';

export type GameSessionAttendee = {
  id: string;
  source: AttendeeSource;
};

// Player RSVP status for a game
export type RsvpStatus = 
  | 'PENDING'      // Invited, awaiting response
  | 'CONFIRMED'    // Accepted the invite
  | 'DECLINED'     // Said no
  | 'CANCELLED'    // Was confirmed, then backed out
  | 'WAITLIST'     // Game full, on waitlist
  | 'EXPIRED';     // Never responded, invite expired

// Overall game session status
export type GameSessionStatus = 
  | 'open'         // Still accepting players
  | 'full'         // All spots filled
  | 'cancelled'    // Organizer cancelled
  | 'completed';   // Game finished

// This is the shape of the data retrieved from Firestore
export type GameSession_Firestore = {
  id: string;
  courtId: string;
  organizerId: string;
  startTime: Timestamp;
  startTimeDisplay?: string;
  isDoubles: boolean;
  durationMinutes?: number;
  
  // Player management
  playerIds: string[];
  attendees?: GameSessionAttendee[];
  playerStatuses?: Record<string, RsvpStatus>;
  alternates?: string[];  // Waitlist player IDs in order
  
  // Game status
  status: GameSessionStatus;
  minPlayers?: number;  // Minimum to play (default: 2 for singles, 4 for doubles)
  maxPlayers?: number;  // Maximum allowed
  
  // Group support
  groupIds?: string[];
  
  // Notification tracking
  invitesSentAt?: Timestamp;
  lastReminderAt?: Timestamp;
  gameFullNotifiedAt?: Timestamp;
}

// This is the fully "hydrated" shape used in the UI
export type GameSession = {
  id: string;
  court: Court;
  organizer: Player;
  date: string;
  time: string;
  type: 'Singles' | 'Doubles' | 'Custom';
  players: {
    player: Player;
    status: RsvpStatus;
  }[];
  alternates: Player[];
};

export interface Message {
  sender: 'user' | 'robin';
  text: string;
}

export const ChatHistorySchema = z.object({
  sender: z.enum(['user', 'robin']),
  text: z.string(),
});
export type ChatHistory = z.infer<typeof ChatHistorySchema>;


export const ChatInputSchema = z.object({
  message: z.string().describe("The user's message."),
  history: z.array(ChatHistorySchema).describe('The conversation history.'),
});
export type ChatInput = z.infer<typeof ChatInputSchema>;

const InvitedPlayerSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  phone: z.string().optional(),
});
export type InvitedPlayer = z.infer<typeof InvitedPlayerSchema>;

export const ChatOutputSchema = z.object({
  players: z.array(z.string()).nullish().describe('The names of the players to invite.'),
  date: z.string().nullish().describe('The date of the game.'),
  time: z.string().nullish().describe('The time of the game.'),
  location: z.string().nullish().describe('The location of the game.'),
  confirmationText: z.string().nullish().describe("Robin's confirmation or conversational response."),
  // Internal fields not for the LLM
  invitedPlayers: z.array(InvitedPlayerSchema).nullish(),
  currentUser: z.any().nullish(),
})
export type ChatOutput = z.infer<typeof ChatOutputSchema>

    
