import { z } from 'zod';

export type Player = {
  id: string;
  name?: string; // Keep for fallback, but prefer firstName/lastName
  avatarUrl: string;
  phone?: string;
  isCurrentUser?: boolean; 
  firstName: string;
  lastName: string;
  email: string;
};

export type Court = {
  id: string;
  name:string;
  location: string;
  isHome?: boolean;
  isFavorite?: boolean;
};

export type Group = {
  id: string;
  name: string;
  avatarUrl: string;
  members: string[]; // Now an array of user IDs
};

export type RsvpStatus = 'CONFIRMED' | 'DECLINED' | 'PENDING';

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
  players: z.array(z.string()).optional().describe('The names of the players to invite.'),
  date: z.string().optional().describe('The date of the game.'),
  time: z.string().optional().describe('The time of the game.'),
  location: z.string().optional().describe('The location of the game.'),
  confirmationText: z.string().optional().describe("Robin's confirmation or conversational response."),
  // Internal fields not for the LLM
  invitedPlayers: z.array(InvitedPlayerSchema).optional(),
  currentUser: z.any().optional(),
})
export type ChatOutput = z.infer<typeof ChatOutputSchema>
