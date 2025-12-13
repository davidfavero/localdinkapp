'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mic, Send, Sparkles, Trash2 } from 'lucide-react';
import { UserAvatar } from '@/components/user-avatar';
import { chatAction } from '@/lib/actions';
import { RobinIcon } from '@/components/icons/robin-icon';
import type { Message, Player, Group } from '@/lib/types';
import { useUser, useFirestore, useFirebase, useMemoFirebase } from '@/firebase/provider';
import { collection, query } from 'firebase/firestore';
import { useCollection } from '@/firebase/firestore/use-collection';

const CHAT_STORAGE_KEY = 'robin-chat-messages';
const DEFAULT_MESSAGE: Message = {
  sender: 'robin',
  text: "Hi! I'm Robin, your AI scheduling assistant. I can help you schedule pickleball games, find courts, and manage your sessions. Just tell me who you want to play with, when, and where - for example: 'Schedule a game with Melissa tomorrow at 4pm at I'On Courts'. What would you like to do?",
};

export default function RobinChatPage() {
  // Load messages from localStorage on initial render
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(CHAT_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch (e) {
        console.warn('Could not load chat history:', e);
      }
    }
    return [DEFAULT_MESSAGE];
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { profile: currentUser, user: authUser, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { user } = useFirebase();
  const [knownPlayers, setKnownPlayers] = useState<Player[]>([]);
  const [knownGroups, setKnownGroups] = useState<(Group & { id: string })[]>([]);

  // Use real-time listeners for users, players, and groups
  const usersQuery = useMemoFirebase(
    () => firestore && user?.uid ? query(collection(firestore, 'users')) : null,
    [firestore, user?.uid]
  );
  const { data: usersData } = useCollection<Player>(usersQuery);

  const playersQuery = useMemoFirebase(
    () => firestore && user?.uid ? query(collection(firestore, 'players')) : null,
    [firestore, user?.uid]
  );
  const { data: playersData } = useCollection<Player>(playersQuery);

  const groupsQuery = useMemoFirebase(
    () => firestore && user?.uid ? query(collection(firestore, 'groups')) : null,
    [firestore, user?.uid]
  );
  const { data: groupsData } = useCollection<Group>(groupsQuery);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined' && messages.length > 0) {
      try {
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
      } catch (e) {
        console.warn('Could not save chat history:', e);
      }
    }
  }, [messages]);

  // Combine users and players data from Firestore queries
  useEffect(() => {
    if (isUserLoading || !authUser?.uid) {
      // While loading, just use current user if available
      if (currentUser) {
        setKnownPlayers([{ ...currentUser, isCurrentUser: true }]);
      }
      return;
    }

    const existingIds = new Set<string>();
    const allPlayers: Player[] = [];

    const addPlayer = (player: Player) => {
      if (player.id && !existingIds.has(player.id)) {
        allPlayers.push(player);
        existingIds.add(player.id);
      }
    };

    // Add users from Firestore
    if (usersData) {
      usersData.forEach(user => {
        addPlayer(user);
      });
    }

    // Add players from Firestore
    if (playersData) {
      playersData.forEach(player => {
        addPlayer(player);
      });
    }

    // Ensure current user is included
    if (currentUser) {
      addPlayer(currentUser);
    }

    // Mark current user
    const playersWithCurrent = allPlayers.map(p => ({
      ...p,
      isCurrentUser: p.id === authUser.uid
    }));

    setKnownPlayers(playersWithCurrent);
  }, [usersData, playersData, currentUser, authUser?.uid, isUserLoading]);

  // Set groups data
  useEffect(() => {
    if (groupsData) {
      // groupsData already includes id from useCollection
      setKnownGroups(groupsData as (Group & { id: string })[]);
    }
  }, [groupsData]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const clearChat = () => {
    setMessages([DEFAULT_MESSAGE]);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(CHAT_STORAGE_KEY);
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    console.log('[Chat] handleSend called, input:', input);
    if (input.trim()) {
      const newUserMessage: Message = { sender: 'user', text: input.trim() };
      const currentInput = input;
      
      // Use a functional state update to ensure we have the latest messages
      setMessages(prevMessages => [...prevMessages, newUserMessage]);
      setInput('');
      setIsLoading(true);

      try {
        // Pass the latest state to the action with known players and groups
        const history = [...messages, newUserMessage].map(m => ({...m, sender: m.sender as 'user' | 'robin' }));
        console.log('[Chat] Calling chatAction with:', currentInput.trim());
        console.log('[Chat] Known groups:', knownGroups.map(g => g.name));
        const response = await chatAction({ message: currentInput.trim(), history }, currentUser || null, knownPlayers, knownGroups);
        console.log('[Chat] Got response:', response);
        
        let responseText = response.confirmationText || "I'm not sure how to respond to that.";

        const newRobinMessage: Message = { sender: 'robin', text: responseText };

        setMessages(prevMessages => [...prevMessages, newRobinMessage]);
        
      } catch (error) {
        console.error("Error in chat action:", error);
        setMessages(prev => [...prev, { sender: 'robin', text: "Sorry, I'm having trouble connecting right now." }]);
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto pr-4 -mr-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex items-end gap-2 ${
              message.sender === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {message.sender === 'robin' && (
               <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-accent">
                <RobinIcon className="h-6 w-6" />
               </div>
            )}
            <div
              className={`max-w-xs md:max-w-md rounded-2xl p-3 ${
                message.sender === 'user'
                  ? 'bg-primary text-primary-foreground rounded-br-none'
                  : 'bg-muted text-foreground rounded-bl-none'
              }`}
            >
              <p>{message.text}</p>
            </div>
             {message.sender === 'user' && currentUser && (
                <UserAvatar player={currentUser} className="h-8 w-8" />
             )}
          </div>
        ))}
         {isLoading && (
          <div className="flex items-end gap-2 justify-start">
            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-accent">
              <Sparkles className="h-5 w-5 animate-spin" />
            </div>
            <div className="max-w-xs md:max-w-md rounded-2xl p-3 bg-muted text-foreground rounded-bl-none">
              <p className="animate-pulse">Robin is thinking...</p>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

       <div className="bg-background/80 backdrop-blur-sm border-t -mx-4 -mb-4 mt-4 p-4">
         <div className="flex items-center gap-2">
            <Button 
              size="icon" 
              variant="ghost" 
              className="text-muted-foreground"
              onClick={clearChat}
              title="Clear chat history"
            >
                <Trash2 className="h-4 w-4" />
            </Button>
            <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !isLoading && handleSend()}
                placeholder="Chat with Robin..."
                className="flex-1"
                disabled={isLoading}
            />
            <Button size="icon" onClick={handleSend} disabled={!input.trim() || isLoading}>
                <Send />
            </Button>
         </div>
       </div>
    </div>
  );
}
