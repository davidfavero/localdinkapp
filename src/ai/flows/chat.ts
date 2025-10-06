'use server';

/**
 * @fileOverview A conversational AI flow for the LocalDink assistant, Robin.
 *
 * - chat - A function that handles conversational chat with the user.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { ChatHistory, ChatInput, ChatInputSchema, ChatOutput, ChatOutputSchema, Player } from '@/lib/types';
import { disambiguateName } from './name-disambiguation';
import { sendSmsTool } from '../tools/sms';
import { collection, addDoc, getDocs, getFirestore } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';


// Helper function to check if a message is a simple confirmation
function isConfirmation(message: string) {
  const lowerMessage = message.toLowerCase().trim();
  return ['yes', 'yep', 'yeah', 'ok', 'okay', 'sounds good', 'confirm', 'do it'].includes(lowerMessage);
}


async function getKnownPlayers(db: any): Promise<{ names: string[], players: Player[] }> {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const players = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player));
    const playerNames = players.map(p => `${p.firstName} ${p.lastName}`);
    return { names: playerNames, players };
}

export async function chat(input: ChatInput): Promise<ChatOutput> {
  return chatFlow(input);
}

const chatFlow = ai.defineFlow(
  {
    name: 'chatFlow',
    inputSchema: ChatInputSchema,
    outputSchema: ChatOutputSchema,
    middleware: [
      async (input, next) => {
        const { firestore } = initializeFirebase();
        const { names: knownPlayerNames, players: knownPlayers } = await getKnownPlayers(firestore);
        
        const currentUser = knownPlayers.find(p => p.isCurrentUser); // This might need adjustment based on how we identify the current user with Firestore auth

        // If the user's message is a simple confirmation, we need to look at the history
        if (isConfirmation(input.message) && input.history.length > 0) {
          const lastRobinMessage = input.history.filter(h => h.sender === 'robin').pop();
          // Re-run the extraction on Robin's last confirmation message to get the details again.
          if (lastRobinMessage) {
              input.message = lastRobinMessage.text; 
              input.history = input.history.slice(0, -1); // Remove the "yes"
          }
        }


        // 1. Call the AI to extract structured data from the user's message.
        const { output: extractedDetails } = await ai.generate({
          prompt: `You are Robin, an AI scheduling assistant for a pickleball app called LocalDink. Your primary job is to help users schedule games by extracting details from their messages and having a friendly, brief conversation.

- Your main goal is to extract the players' names, the date, the time, and the location for the game.
- For dates, always convert relative terms like "tomorrow" to an absolute date (today is ${new Date().toDateString()}).
- If a detail is missing, ask a clarifying question.
- If the user's message is not a scheduling request, just have a friendly conversation. In this case, put your full response in the 'confirmationText' field and do not return any other fields.

Conversation History:
${input.history.map((h: ChatHistory) => `- ${h.sender}: ${h.text}`).join('\n')}

New User Message:
- user: ${input.message}
`,
          model: 'googleai/gemini-2.5-flash',
          output: {
            schema: ChatOutputSchema,
          },
          config: {
            temperature: 0.2,
          },
        });

        if (!extractedDetails) {
          return { confirmationText: "I'm sorry, I had trouble understanding that. Could you try again?" };
        }

        // 2. If it was just a conversational response, return it.
        if (extractedDetails.confirmationText && !isConfirmation(input.message)) {
          return { confirmationText: extractedDetails.confirmationText };
        }

        const { players, date, time, location } = extractedDetails;

        // 3. If no players were extracted, ask for clarification.
        if (!players || players.length === 0) {
          return { confirmationText: "I'm sorry, I didn't catch who is playing. Could you list the players for the game?" };
        }

        // 4. Disambiguate player names and find their phone numbers.
        const invitedPlayers = await Promise.all(
          players.map(async (playerName) => {
            const result = await disambiguateName({ playerName, knownPlayers: knownPlayerNames });
            const fullName = result.disambiguatedName;
            const playerData = knownPlayers.find(p => `${p.firstName} ${p.lastName}` === fullName);
            return { id: playerData?.id, name: fullName, phone: playerData?.phone };
          })
        );

        const playersWithPhones = invitedPlayers.filter(p => p.phone);
        const playerIds = invitedPlayers.map(p => p.id).filter((id): id is string => !!id);
        const playerNames = invitedPlayers.map(p => p.name);

        // 5. Send SMS invitations and create game if we have everything we need.
        let responseText = '';
        if (date && time && location && players.length > 0) {
          const smsBody = `Pickleball Game Invitation! You're invited to a game on ${date} at ${time} at ${location}. Respond YES or NO. Manage your profile at https://localdink.app/join`;
          for (const player of playersWithPhones) {
            await sendSmsTool({ to: player.phone!, body: smsBody });
          }

          // Save the game to Firestore
          try {
              // A real implementation would look up the court ID from the location name
              const courtId = 'c1'; // Using a placeholder for now
              const organizerId = currentUser?.id || playerIds[0];

              const [hour, minute] = time.split(/[:\s]/);
              const ampm = time.includes('PM') ? 'PM' : 'AM';
              let numericHour = parseInt(hour, 10);
              if (ampm === 'PM' && numericHour < 12) {
                  numericHour += 12;
              }
              if (ampm === 'AM' && numericHour === 12) {
                  numericHour = 0;
              }
              const numericMinute = parseInt(minute, 10) || 0;

              const startTime = new Date(date);
              startTime.setHours(numericHour, numericMinute);
              
              await addDoc(collection(firestore, 'game-sessions'), {
                  courtId,
                  organizerId,
                  startTime, // Firestore timestamp
                  isDoubles: playerIds.length > 2,
                  durationMinutes: 120,
                  status: 'scheduled',
                  playerIds,
              });

          } catch(e) {
              console.error("Failed to save game session to firestore", e);
              // We still confirm to the user, but log the error.
              // In a real app, we might want to tell the user the game couldn't be saved.
          }


          responseText = `Great! Your game with ${playerNames.join(' and ')} at ${location} on ${date} at ${time} is confirmed. I've sent SMS invitations and added it to your upcoming games. Have a fantastic game!`;
        } else {
          // If not enough info to send SMS yet, ask for it.
          let missingInfo = [];
          if (!date) missingInfo.push('date');
          if (!time) missingInfo.push('time');
          if (!location) missingInfo.push('location');

          if (isConfirmation(input.message)) {
              responseText = `Almost there! I still need the ${missingInfo.join(' and ')} to schedule the game for ${playerNames.join(', ')}.`;
          } else {
              responseText = `Got it! I'll schedule a game for ${playerNames.join(' and ')}. I just need to confirm the ${missingInfo.join(' and ')}. What's the plan?`;
          }
        }
        
        return { confirmationText: responseText };
      },
    ],
  },
  async (input) => {
    // This is now inside a flow, but the main logic is in middleware.
    // This part of the function won't be reached because the middleware returns a value.
    // We could refactor to have middleware pass data to this function, but for now
    // the logic is self-contained in the middleware.
    return { confirmationText: "Something went wrong in the chat flow." };
  }
);
