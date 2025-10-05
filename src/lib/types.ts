import { z } from 'zod';

export type Player = {
  id: string;
  name: string;
  avatarUrl: string;
  phone?: string;
  isCurrentUser?: boolean;
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
  members: Player[];
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

export const ChatInputSchema = z.object({
  message: z.string().describe("The user's message."),
  history: z.array(z.object({
    sender: z.enum(['user', 'robin']),
    text: z.string(),
  })).describe('The conversation history.'),
});
export type ChatInput = z.infer<typeof ChatInputSchema>;

export type ChatOutput = string;
