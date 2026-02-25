'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Sparkles, Trash2, Check, X, Calendar, MapPin, Plus, UserPlus } from 'lucide-react';
import { UserAvatar } from '@/components/user-avatar';
import { chatAction, updateRsvpStatusAction, addCourtAction, addPlayerAction } from '@/lib/actions';
import { RobinIcon } from '@/components/icons/robin-icon';
import type { Message, Player, Group, Court } from '@/lib/types';
import { useUser, useFirestore, useFirebase, useMemoFirebase } from '@/firebase/provider';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useCollection } from '@/firebase/firestore/use-collection';
import { Card } from '@/components/ui/card';

const CHAT_STORAGE_KEY = 'robin-chat-messages';
const CHAT_USER_KEY = 'robin-chat-user-id';
const DEFAULT_MESSAGE: Message = {
  sender: 'robin',
  text: "Hi! I'm Robin, your AI scheduling assistant. I can help you schedule pickleball games, find courts, and manage your sessions. Just tell me who you want to play with, when, and where - for example: 'Schedule a game with Melissa tomorrow at 4pm at I'On Courts'. What would you like to do?",
};

export default function RobinChatPage() {
  const { profile: currentUser, user: authUser, isUserLoading } = useUser();
  
  // Load messages from localStorage on initial render, but only if same user
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedUserId = localStorage.getItem(CHAT_USER_KEY);
        const saved = localStorage.getItem(CHAT_STORAGE_KEY);
        // Only restore messages if we don't know the user yet (will be validated in useEffect)
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
  const firestore = useFirestore();
  const { user } = useFirebase();
  const [knownPlayers, setKnownPlayers] = useState<Player[]>([]);
  const [knownGroups, setKnownGroups] = useState<(Group & { id: string })[]>([]);
  const [knownCourts, setKnownCourts] = useState<Court[]>([]);

  // Players owned by current user
  const playersQuery = useMemoFirebase(
    () => firestore && user?.uid ? query(collection(firestore, 'players'), where('ownerId', '==', user.uid)) : null,
    [firestore, user?.uid]
  );
  const { data: playersData } = useCollection<Player>(playersQuery);

  // Groups owned by current user
  const groupsQuery = useMemoFirebase(
    () => firestore && user?.uid ? query(collection(firestore, 'groups'), where('ownerId', '==', user.uid)) : null,
    [firestore, user?.uid]
  );
  const { data: groupsData } = useCollection<Group>(groupsQuery);

  // Courts owned by current user
  const courtsQuery = useMemoFirebase(
    () => firestore && user?.uid ? query(collection(firestore, 'courts'), where('ownerId', '==', user.uid)) : null,
    [firestore, user?.uid]
  );
  const { data: courtsData } = useCollection<Court>(courtsQuery);

  // Query for sessions where user is invited (for pending invites)
  const invitesQuery = useMemoFirebase(
    () => firestore && user?.uid ? query(collection(firestore, 'game-sessions'), where('playerIds', 'array-contains', user.uid)) : null,
    [firestore, user?.uid]
  );
  const { data: invitedSessionsRaw } = useCollection<any>(invitesQuery);
  
  // State for hydrated pending invites
  const [pendingInvites, setPendingInvites] = useState<{
    id: string;
    courtName: string;
    organizerName: string;
    date: string;
    time: string;
    type: string;
  }[]>([]);
  const [isRespondingToInvite, setIsRespondingToInvite] = useState<string | null>(null);
  
  // Hydrate pending invites with court and organizer info
  useEffect(() => {
    if (!invitedSessionsRaw || !firestore || !user?.uid) {
      setPendingInvites([]);
      return;
    }
    
    const hydrateInvites = async () => {
      const pending = invitedSessionsRaw.filter(session => {
        if (session.organizerId === user.uid) return false;
        const status = session.playerStatuses?.[user.uid];
        return status === 'PENDING';
      });
      
      if (pending.length === 0) {
        setPendingInvites([]);
        return;
      }
      
      // Fetch court and organizer info
      const courtIds = [...new Set(pending.map(s => s.courtId).filter(Boolean))];
      const organizerIds = [...new Set(pending.map(s => s.organizerId).filter(Boolean))];
      
      const courtsMap = new Map<string, string>();
      const organizersMap = new Map<string, string>();
      
      // Fetch courts
      for (const courtId of courtIds) {
        try {
          const courtSnap = await getDocs(query(collection(firestore, 'courts'), where('__name__', '==', courtId)));
          if (!courtSnap.empty) {
            const courtData = courtSnap.docs[0].data();
            courtsMap.set(courtId, courtData.name || 'Unknown Court');
          }
        } catch (e) {
          console.warn('Could not fetch court:', e);
        }
      }
      
      // Fetch organizers
      for (const odid of organizerIds) {
        try {
          const orgSnap = await getDocs(query(collection(firestore, 'users'), where('__name__', '==', odid)));
          if (!orgSnap.empty) {
            const orgData = orgSnap.docs[0].data();
            organizersMap.set(odid, `${orgData.firstName || ''} ${orgData.lastName || ''}`.trim() || 'Someone');
          }
        } catch (e) {
          console.warn('Could not fetch organizer:', e);
        }
      }
      
      const hydrated = pending.map(session => {
        const sessionDate = session.startTime?.toDate ? session.startTime.toDate() : new Date(session.startTime ?? Date.now());
        return {
          id: session.id,
          courtName: courtsMap.get(session.courtId) || 'Unknown Court',
          organizerName: organizersMap.get(session.organizerId) || 'Someone',
          date: sessionDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }),
          time: sessionDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          type: session.isDoubles ? 'Doubles' : 'Singles',
        };
      });
      
      setPendingInvites(hydrated);
    };
    
    hydrateInvites();
  }, [invitedSessionsRaw, firestore, user?.uid]);
  
  // Handle accept/decline invite
  const handleInviteResponse = async (sessionId: string, accept: boolean) => {
    if (!user?.uid) return;
    
    setIsRespondingToInvite(sessionId);
    try {
      const result = await updateRsvpStatusAction(sessionId, user.uid, accept ? 'CONFIRMED' : 'DECLINED');
      
      // Add Robin's response to the chat
      const invite = pendingInvites.find(i => i.id === sessionId);
      const responseText = result.success 
        ? (accept 
            ? `Great! I've confirmed your spot for the ${invite?.type} game at ${invite?.courtName} on ${invite?.date} at ${invite?.time}. See you there! 🎾`
            : `No problem! I've declined the invite for the game at ${invite?.courtName}. Let me know if you want to schedule something else!`)
        : `Sorry, I had trouble updating your response: ${result.message}`;
      
      setMessages(prev => [...prev, { sender: 'robin', text: responseText }]);
      
      // Remove the invite from the list
      setPendingInvites(prev => prev.filter(i => i.id !== sessionId));
    } catch (error) {
      console.error('Error responding to invite:', error);
      setMessages(prev => [...prev, { sender: 'robin', text: "Sorry, I had trouble updating your response. Please try again." }]);
    } finally {
      setIsRespondingToInvite(null);
    }
  };
  
  // State for unknown courts/players that can be added
  const [pendingUnknownCourt, setPendingUnknownCourt] = useState<{ name: string; suggestedLocation?: string } | null>(null);
  const [pendingUnknownPlayers, setPendingUnknownPlayers] = useState<{ name: string; suggestedEmail?: string; suggestedPhone?: string }[]>([]);
  const [isAddingCourt, setIsAddingCourt] = useState(false);
  const [isAddingPlayer, setIsAddingPlayer] = useState<string | null>(null);
  const [newPlayerPhone, setNewPlayerPhone] = useState('');
  const [newPlayerEmail, setNewPlayerEmail] = useState('');
  
  // Handle adding a new court
  const handleAddCourt = async () => {
    if (!pendingUnknownCourt || !authUser?.uid) return;
    
    setIsAddingCourt(true);
    try {
      const result = await addCourtAction({
        name: pendingUnknownCourt.name,
        location: pendingUnknownCourt.suggestedLocation || '',
      }, authUser.uid);
      
      const responseText = result.success 
        ? `Perfect! I've added "${pendingUnknownCourt.name}" to your courts. Now I can schedule your game there! 🏸`
        : `Sorry, I had trouble adding the court: ${result.message}`;
      
      setMessages(prev => [...prev, { sender: 'robin', text: responseText }]);
      setPendingUnknownCourt(null);
    } catch (error) {
      console.error('Error adding court:', error);
      setMessages(prev => [...prev, { sender: 'robin', text: "Sorry, I had trouble adding the court. Please try again." }]);
    } finally {
      setIsAddingCourt(false);
    }
  };
  
  // Handle adding a new player
  const handleAddPlayer = async (playerName: string) => {
    if (!authUser?.uid) return;
    
    // Parse first and last name
    const nameParts = playerName.trim().split(' ');
    const firstName = nameParts[0] || playerName;
    const lastName = nameParts.slice(1).join(' ') || '';
    
    setIsAddingPlayer(playerName);
    try {
      const result = await addPlayerAction({
        firstName,
        lastName,
        email: newPlayerEmail || undefined,
        phone: newPlayerPhone || undefined,
      }, authUser.uid);
      
      const responseText = result.success 
        ? `Added ${firstName} ${lastName} to your contacts! ${newPlayerPhone ? 'They\'ll receive SMS invites.' : 'Add their phone number later to send them invites.'}`
        : `Sorry, I had trouble adding the player: ${result.message}`;
      
      setMessages(prev => [...prev, { sender: 'robin', text: responseText }]);
      setPendingUnknownPlayers(prev => prev.filter(p => p.name !== playerName));
      setNewPlayerPhone('');
      setNewPlayerEmail('');
    } catch (error) {
      console.error('Error adding player:', error);
      setMessages(prev => [...prev, { sender: 'robin', text: "Sorry, I had trouble adding the player. Please try again." }]);
    } finally {
      setIsAddingPlayer(null);
    }
  };

  // Clear chat when user changes (reset Robin for new user)
  useEffect(() => {
    if (typeof window !== 'undefined' && authUser?.uid) {
      const savedUserId = localStorage.getItem(CHAT_USER_KEY);
      if (savedUserId && savedUserId !== authUser.uid) {
        // Different user logged in - clear the chat
        console.log('[Chat] User changed, clearing chat history');
        localStorage.removeItem(CHAT_STORAGE_KEY);
        localStorage.setItem(CHAT_USER_KEY, authUser.uid);
        setMessages([DEFAULT_MESSAGE]);
      } else if (!savedUserId) {
        // First time for this user - save their ID
        localStorage.setItem(CHAT_USER_KEY, authUser.uid);
      }
    }
  }, [authUser?.uid]);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined' && messages.length > 0 && authUser?.uid) {
      try {
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
        localStorage.setItem(CHAT_USER_KEY, authUser.uid);
      } catch (e) {
        console.warn('Could not save chat history:', e);
      }
    }
  }, [messages, authUser?.uid]);

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
  }, [playersData, currentUser, authUser?.uid, isUserLoading]);

  // Set groups data
  useEffect(() => {
    if (groupsData) {
      // groupsData already includes id from useCollection
      setKnownGroups(groupsData as (Group & { id: string })[]);
    }
  }, [groupsData]);

  // Set courts data
  useEffect(() => {
    if (courtsData) {
      setKnownCourts(courtsData);
    }
  }, [courtsData]);

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
      
      // Clear any previous pending unknowns
      setPendingUnknownCourt(null);
      setPendingUnknownPlayers([]);

      try {
        // Pass the latest state to the action with known players, groups, and courts
        const history = [...messages, newUserMessage].map(m => ({...m, sender: m.sender as 'user' | 'robin' }));
        console.log('[Chat] Calling chatAction with:', currentInput.trim());
        console.log('[Chat] Known groups:', knownGroups.map(g => g.name));
        console.log('[Chat] Known courts:', knownCourts.map(c => c.name));
        const response = await chatAction({ message: currentInput.trim(), history }, currentUser || null, knownPlayers, knownGroups, knownCourts);
        console.log('[Chat] Got response:', response);
        
        let responseText = response.confirmationText || "I'm not sure how to respond to that.";

        const newRobinMessage: Message = { sender: 'robin', text: responseText };

        setMessages(prevMessages => [...prevMessages, newRobinMessage]);
        
        // Check for unknown court/players that can be added
        if (response.unknownCourt) {
          console.log('[Chat] Unknown court detected:', response.unknownCourt);
          setPendingUnknownCourt(response.unknownCourt);
        }
        if (response.unknownPlayers && response.unknownPlayers.length > 0) {
          console.log('[Chat] Unknown players detected:', response.unknownPlayers);
          setPendingUnknownPlayers(response.unknownPlayers);
        }
        
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
        
        {/* Pending Invites Section - Show after initial message */}
        {pendingInvites.length > 0 && messages.length <= 2 && (
          <div className="flex items-start gap-2 justify-start">
            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-accent flex-shrink-0">
              <RobinIcon className="h-6 w-6" />
            </div>
            <div className="max-w-sm md:max-w-lg">
              <div className="rounded-2xl p-3 bg-muted text-foreground rounded-bl-none mb-2">
                <p className="font-medium">🎾 You have {pendingInvites.length} pending game invite{pendingInvites.length > 1 ? 's' : ''}!</p>
              </div>
              <div className="space-y-2">
                {pendingInvites.map(invite => (
                  <Card key={invite.id} className="p-3 bg-background border-primary/20">
                    <div className="flex flex-col gap-2">
                      <div className="font-medium text-sm">{invite.organizerName} invited you to play</div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {invite.courtName}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {invite.date} at {invite.time}
                        </span>
                      </div>
                      <div className="flex gap-2 mt-1">
                        <Button
                          size="sm"
                          className="flex-1 h-8"
                          onClick={() => handleInviteResponse(invite.id, true)}
                          disabled={isRespondingToInvite === invite.id}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          I'm In!
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-8"
                          onClick={() => handleInviteResponse(invite.id, false)}
                          disabled={isRespondingToInvite === invite.id}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Can't Make It
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        )}
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
        
        {/* Add Court Button - Shows when Robin detects an unknown court */}
        {pendingUnknownCourt && !isLoading && (
          <div className="flex items-start gap-2 justify-start">
            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-accent flex-shrink-0">
              <RobinIcon className="h-6 w-6" />
            </div>
            <Card className="p-3 bg-background border-primary/30 max-w-sm">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <MapPin className="h-4 w-4 text-primary" />
                  Add "{pendingUnknownCourt.name}" to your courts?
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 h-8"
                    onClick={handleAddCourt}
                    disabled={isAddingCourt}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    {isAddingCourt ? 'Adding...' : 'Add Court'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => setPendingUnknownCourt(null)}
                    disabled={isAddingCourt}
                  >
                    Skip
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
        
        {/* Add Player Buttons - Shows when Robin detects unknown players */}
        {pendingUnknownPlayers.length > 0 && !isLoading && (
          <div className="flex items-start gap-2 justify-start">
            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-accent flex-shrink-0">
              <RobinIcon className="h-6 w-6" />
            </div>
            <div className="space-y-2 max-w-sm">
              {pendingUnknownPlayers.map((player) => (
                <Card key={player.name} className="p-3 bg-background border-primary/30">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <UserPlus className="h-4 w-4 text-primary" />
                      Add "{player.name}" to your contacts?
                    </div>
                    <Input
                      placeholder="Phone (optional)"
                      value={isAddingPlayer === player.name ? newPlayerPhone : ''}
                      onChange={(e) => setNewPlayerPhone(e.target.value)}
                      className="h-8 text-sm"
                    />
                    <Input
                      placeholder="Email (optional)"
                      value={isAddingPlayer === player.name ? newPlayerEmail : ''}
                      onChange={(e) => setNewPlayerEmail(e.target.value)}
                      className="h-8 text-sm"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 h-8"
                        onClick={() => handleAddPlayer(player.name)}
                        disabled={isAddingPlayer === player.name}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        {isAddingPlayer === player.name ? 'Adding...' : 'Add Player'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() => setPendingUnknownPlayers(prev => prev.filter(p => p.name !== player.name))}
                        disabled={isAddingPlayer === player.name}
                      >
                        Skip
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

       <div className="bg-background/80 backdrop-blur-sm border-t -mx-4 -mb-4 mt-4 p-4 pb-24">
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
