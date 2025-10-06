'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mic, Send, Sparkles } from 'lucide-react';
import { UserAvatar } from '@/components/user-avatar';
import { chatAction } from '@/lib/actions';
import { RobinIcon } from '@/components/icons/robin-icon';
import type { Message, Player } from '@/lib/types';
import { useCollection, useUser, useFirestore } from '@/firebase';
import { collection, query } from 'firebase/firestore';
import { useMemoFirebase } from '@/firebase/provider';

// Helper function to check if a message is a simple confirmation
function isConfirmation(message: string) {
  const lowerMessage = message.toLowerCase().trim();
  return ['yes', 'yep', 'yeah', 'ok', 'okay', 'sounds good', 'confirm', 'do it', 'try again', 'i did, yes.'].includes(lowerMessage);
}


export default function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: 'robin',
      text: "Sure, I can help with that! When do you want to schedule the game and who will be playing?",
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { user } = useUser();
  const firestore = useFirestore();
  const playersQuery = useMemoFirebase(() => (firestore ? query(collection(firestore, 'users')) : null), [firestore]);
  const { data: players } = useCollection<Player>(playersQuery);
  const currentUser = players?.find((p) => p.id === user?.uid);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (input.trim()) {
      const newUserMessage: Message = { sender: 'user', text: input.trim() };
      const currentInput = input;
      
      // Use a functional state update to ensure we have the latest messages
      setMessages(prevMessages => [...prevMessages, newUserMessage]);
      setInput('');
      setIsLoading(true);

      try {
        // Pass the latest state to the action
        const history = [...messages, newUserMessage].map(m => ({...m, sender: m.sender as 'user' | 'robin' }));
        const response = await chatAction({ message: currentInput.trim(), history });
        
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
            <Button size="icon" variant="ghost" className="text-muted-foreground">
                <Mic />
            </Button>
            <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !isLoading && handleSend()}
                placeholder="Type a message..."
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
