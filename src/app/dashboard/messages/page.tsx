'use client';
import { MessageCircle } from 'lucide-react';

export default function MessagesPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <MessageCircle className="w-24 h-24 text-muted-foreground/50 mb-4" />
      <h1 className="text-2xl font-bold font-headline text-foreground">
        Player-to-Player Messaging
      </h1>
      <p className="mt-2 text-lg text-muted-foreground max-w-md">
        This feature is coming soon! You'll be able to chat directly with other players and groups right here.
      </p>
    </div>
  );
}
