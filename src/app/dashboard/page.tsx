'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mic, Send, Sparkles, Trash2 } from 'lucide-react';
import { UserAvatar } from '@/components/user-avatar';
import { chatAction } from '@/lib/actions';
import { RobinIcon } from '@/components/icons/robin-icon';
import type { Message, Player, Group } from '@/lib/types';
import { useUser, useFirestore } from '@/firebase/provider';
import { collection, query, getDocs } from 'firebase/firestore';

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
  const [knownPlayers, setKnownPlayers] = useState<Player[]>([]);
  const [knownGroups, setKnownGroups] = useState<(Group & { id: string })[]>([]);

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

  // Fetch known players and groups from Firestore
  useEffect(() => {
    const fetchData = async () => {
      // Wait for auth to be fully ready - check both user and loading state
      if (isUserLoading || !firestore || !authUser?.uid) {
        if (currentUser && !isUserLoading) {
          // If we have current user but auth isn't ready, just use that
          setKnownPlayers([{ ...currentUser, isCurrentUser: true }]);
        }
        return;
      }

      // Ensure auth token is available before making Firestore requests
      // This ensures Firestore SDK has the auth context
      try {
        const { getClientAuth } = await import('@/firebase/auth');
        const auth = getClientAuth();
        if (!auth.currentUser) {
          console.warn('[Dashboard] No current user in auth, skipping data fetch');
          if (currentUser) {
            setKnownPlayers([{ ...currentUser, isCurrentUser: true }]);
          }
          return;
        }

        // Verify we can get an auth token (ensures auth is fully ready)
        // This also ensures Firestore will have the auth token for requests
        const token = await auth.currentUser.getIdToken().catch(() => {
          throw new Error('Auth token not available');
        });
        
        if (!token) {
          throw new Error('Auth token is null');
        }
        
        // Small delay to ensure Firestore SDK has processed the auth state
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (authError) {
        console.warn('[Dashboard] Auth not ready, skipping data fetch:', authError);
        if (currentUser) {
          setKnownPlayers([{ ...currentUser, isCurrentUser: true }]);
        }
        return;
      }

      try {
        const existingIds = new Set<string>();
        const allPlayers: Player[] = [];
        const allGroups: (Group & { id: string })[] = [];

        const addPlayer = (player: Player) => {
          if (player.id && !existingIds.has(player.id)) {
            allPlayers.push(player);
            existingIds.add(player.id);
          }
        };

        // Fetch ALL users (no ownerId filter - users are shared)
        try {
          const usersSnap = await getDocs(collection(firestore, 'users'));
          usersSnap.docs.forEach(doc => {
            addPlayer({ id: doc.id, ...doc.data() } as Player);
          });
          console.log(`[Dashboard] Loaded ${usersSnap.docs.length} users`);
        } catch (e: any) {
          // Handle permission errors gracefully
          if (e.code === 'permission-denied' || e.message?.includes('permission')) {
            console.warn('Permission denied fetching users - auth may not be ready:', e.message);
          } else {
            console.warn('Could not fetch users:', e.message);
          }
        }

        // Fetch ALL players (contacts) - no owner filter to see all players
        try {
          const playersSnap = await getDocs(collection(firestore, 'players'));
          playersSnap.docs.forEach(doc => {
            const data = doc.data();
            addPlayer({ id: doc.id, ...data } as Player);
          });
          console.log(`[Dashboard] Loaded ${playersSnap.docs.length} players`);
        } catch (e: any) {
          if (e.code === 'permission-denied' || e.message?.includes('permission')) {
            console.warn('Permission denied fetching players - auth may not be ready:', e.message);
          } else {
            console.warn('Could not fetch players:', e.message);
          }
        }

        // Fetch ALL groups (with their names for AI matching)
        try {
          const groupsSnap = await getDocs(collection(firestore, 'groups'));
          groupsSnap.docs.forEach(doc => {
            const data = doc.data();
            allGroups.push({ id: doc.id, ...data } as Group & { id: string });
          });
          console.log(`[Dashboard] Loaded ${allGroups.length} groups:`, allGroups.map(g => g.name));
        } catch (e: any) {
          if (e.code === 'permission-denied' || e.message?.includes('permission')) {
            console.warn('Permission denied fetching groups - auth may not be ready:', e.message);
          } else {
            console.warn('Could not fetch groups:', e.message);
          }
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

        console.log('[Dashboard] Final player list:', playersWithCurrent.map(p => `${p.firstName} ${p.lastName}`));
        setKnownPlayers(playersWithCurrent);
        setKnownGroups(allGroups);
      } catch (error: any) {
        console.error('Error fetching data:', error);
        // Fallback to just current user if available
        if (currentUser) {
          setKnownPlayers([{ ...currentUser, isCurrentUser: true }]);
        } else {
          setKnownPlayers([]);
        }
      }
    };

    // Only fetch when auth is fully loaded and ready
    if (!isUserLoading && firestore && authUser?.uid) {
      fetchData();
    }
  }, [firestore, authUser?.uid, currentUser, isUserLoading]);

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
