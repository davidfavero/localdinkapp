'use server';

/**
 * @fileOverview A tool for creating game sessions via the API.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const CreateGameSessionToolSchema = z.object({
  courtId: z.string().describe('The ID of the court where the game will be played.'),
  organizerId: z.string().describe('The user ID of the person organizing the game.'),
  startTime: z.string().describe('ISO 8601 formatted date-time string for when the game starts.'),
  isDoubles: z.boolean().describe('Whether this is a doubles game (true) or singles (false).'),
  playerIds: z.array(z.string()).describe('Array of user/player IDs to invite to the game.'),
  attendees: z.array(z.object({
    id: z.string(),
    source: z.enum(['user', 'player']),
  })).describe('Array of attendees with their source (user or player).'),
  playerStatuses: z.record(z.enum(['CONFIRMED', 'DECLINED', 'PENDING'])).describe('Initial RSVP status for each player.'),
  durationMinutes: z.number().optional().describe('Duration of the game in minutes. Defaults to 120.'),
});

export const createGameSessionTool = ai.defineTool(
  {
    name: 'createGameSessionTool',
    description: 'Creates a new pickleball game session and sends SMS invitations to players. Use this when the user confirms they want to schedule a game with all the details (players, date, time, location).',
    inputSchema: CreateGameSessionToolSchema,
    outputSchema: z.object({
      success: z.boolean(),
      sessionId: z.string().optional(),
      notifiedCount: z.number().optional(),
      error: z.string().optional(),
    }),
  },
  async (input) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002'}/api/game-sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          courtId: input.courtId,
          organizerId: input.organizerId,
          startTime: input.startTime,
          startTimeDisplay: new Date(input.startTime).toLocaleString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          }),
          isDoubles: input.isDoubles,
          durationMinutes: input.durationMinutes || 120,
          status: 'scheduled',
          playerIds: input.playerIds,
          attendees: input.attendees,
          playerStatuses: input.playerStatuses,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        return {
          success: false,
          error: errorData.error || 'Failed to create game session',
        };
      }

      const data = await response.json();
      return {
        success: true,
        sessionId: data.sessionId,
        notifiedCount: data.notifiedCount || 0,
      };
    } catch (error: any) {
      console.error('Failed to create game session:', error);
      return {
        success: false,
        error: error.message || 'Failed to create game session',
      };
    }
  }
);

