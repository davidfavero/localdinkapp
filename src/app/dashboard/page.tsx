'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mic, Send, User } from 'lucide-react';
import { UserAvatar } from '@/components/user-avatar';
import { players } from '@/lib/data';

interface Message {
  sender: 'user' | 'robin';
  text: string;
}

export default function DashboardPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: 'robin',
      text: "Sure, I can help with that! When do you want to schedule the game and who will be playing?",
    },
  ]);
  const [input, setInput] = useState('');
  const currentUser = players.find((p) => p.isCurrentUser);

  const handleSend = () => {
    if (input.trim()) {
      setMessages([...messages, { sender: 'user', text: input.trim() }]);
      // Simulate Robin's response
      setTimeout(() => {
        setMessages(prev => [...prev, { sender: 'robin', text: `I've received your message: "${input.trim()}". I'm still learning how to respond!` }]);
      }, 1000);
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-full">
       <header className="sticky top-0 z-10 flex h-[60px] items-center justify-between gap-4 border-b bg-background/80 backdrop-blur-sm px-4">
          <h1 className="text-xl font-bold text-foreground font-headline">LocalDink</h1>
          <div className="flex items-center gap-4">
              {currentUser && <UserAvatar player={currentUser} className="h-8 w-8" />}
          </div>
       </header>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex items-end gap-2 ${
              message.sender === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {message.sender === 'robin' && (
               <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-accent">
                <User className="h-5 w-5" />
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
      </div>

       <div className="p-4 bg-background/80 backdrop-blur-sm border-t fixed bottom-[76px] left-0 right-0">
         <div className="flex items-center gap-2">
            <Button size="icon" variant="ghost" className="text-muted-foreground">
                <Mic />
            </Button>
            <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Type a message..."
                className="flex-1"
            />
            <Button size="icon" onClick={handleSend} disabled={!input.trim()}>
                <Send />
            </Button>
         </div>
       </div>
    </div>
  );
}
