'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mic, Send, Sparkles } from 'lucide-react';
import { UserAvatar } from '@/components/user-avatar';
import { players } from '@/lib/data';
import { chatAction } from '@/lib/actions';
import { RobinIcon } from '@/components/icons/robin-icon';
import type { Message } from '@/lib/types';
import Link from 'next/link';

export default function DashboardPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: 'robin',
      text: "Sure, I can help with that! When do you want to schedule the game and who will be playing?",
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const currentUser = players.find((p) => p.isCurrentUser);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (input.trim()) {
      const newUserMessage: Message = { sender: 'user', text: input.trim() };
      setMessages(prev => [...prev, newUserMessage]);
      setInput('');
      setIsLoading(true);

      try {
        const history = [...messages, newUserMessage].map(m => ({...m, sender: m.sender as 'user' | 'robin' }));
        const response = await chatAction({ message: input.trim(), history });
        setMessages(prev => [...prev, { sender: 'robin', text: response }]);
      } catch (error) {
        setMessages(prev => [...prev, { sender: 'robin', text: "Sorry, I'm having trouble connecting right now." }]);
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="flex flex-col h-full">
       <header className="sticky top-0 z-10 flex h-[60px] items-center justify-between gap-4 border-b bg-background/80 backdrop-blur-sm px-4">
          <h1 className="text-xl font-bold text-foreground font-headline">LocalDink</h1>
          <div className="flex items-center gap-4">
              {currentUser && (
                <Link href="/dashboard/profile">
                  <UserAvatar player={currentUser} className="h-8 w-8" />
                </Link>
              )}
          </div>
       </header>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-[152px]">
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

       <div className="p-4 bg-background/80 backdrop-blur-sm border-t fixed bottom-[76px] left-0 right-0">
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
