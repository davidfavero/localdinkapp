'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ArrowLeft, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/user-avatar';
import { useUser, useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useDoc } from '@/firebase/firestore/use-doc';
import { collection, query, orderBy, doc, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { sendMessageNotificationAction } from '@/lib/actions';
import type { Conversation, ConversationMessage } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';

interface ConversationDetailProps {
  conversationId: string;
  onBack: () => void;
}

export function ConversationDetail({ conversationId, onBack }: ConversationDetailProps) {
  const { user, profile: currentUser } = useUser();
  const firestore = useFirestore();
  const [messageText, setMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasMarkedRead = useRef(false);

  // Subscribe to conversation doc
  const convRef = useMemoFirebase(() => {
    if (!firestore || !conversationId) return null;
    return doc(firestore, 'conversations', conversationId);
  }, [firestore, conversationId]);

  const { data: conversation } = useDoc<Conversation>(convRef);

  // Subscribe to messages
  const messagesQuery = useMemoFirebase(() => {
    if (!firestore || !conversationId) return null;
    return query(
      collection(firestore, 'conversations', conversationId, 'messages'),
      orderBy('sentAt', 'asc')
    );
  }, [firestore, conversationId]);

  const { data: messages, isLoading } = useCollection<ConversationMessage>(messagesQuery);

  // Display name for header
  const displayName = useMemo(() => {
    if (!conversation || !user) return '';
    if (conversation.type === 'group' && conversation.groupName) {
      return conversation.groupName;
    }
    const otherIds = conversation.participantIds.filter(id => id !== user.uid);
    return otherIds.map(id => conversation.participantNames?.[id] || 'Unknown').join(', ');
  }, [conversation, user]);

  // Mark as read when viewing
  const markAsRead = useCallback(async () => {
    if (!firestore || !user || !conversationId || !conversation) return;
    const lastMsg = conversation.lastMessage;
    if (!lastMsg?.sentAt || lastMsg.senderId === user.uid) return;

    const lastRead = conversation.lastReadAt?.[user.uid];
    const lastReadMs = lastRead && (lastRead as any).toMillis ? (lastRead as any).toMillis() : 0;
    const lastMsgMs = (lastMsg.sentAt as any).toMillis ? (lastMsg.sentAt as any).toMillis() : 0;

    if (lastMsgMs > lastReadMs) {
      const convDocRef = doc(firestore, 'conversations', conversationId);
      updateDoc(convDocRef, {
        [`lastReadAt.${user.uid}`]: serverTimestamp(),
      }).catch(console.error);
    }
  }, [firestore, user, conversationId, conversation]);

  useEffect(() => {
    if (conversation && !hasMarkedRead.current) {
      hasMarkedRead.current = true;
      markAsRead();
    }
  }, [conversation, markAsRead]);

  // Re-mark as read when new messages arrive
  useEffect(() => {
    if (messages && messages.length > 0 && hasMarkedRead.current) {
      markAsRead();
    }
  }, [messages?.length, markAsRead]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages?.length]);

  const handleSend = async () => {
    if (!messageText.trim() || !firestore || !user || !currentUser || isSending) return;

    const text = messageText.trim();
    setMessageText('');
    setIsSending(true);

    const senderName = `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim();

    try {
      // Client-side write for instant display
      await addDoc(collection(firestore, 'conversations', conversationId, 'messages'), {
        conversationId,
        senderId: user.uid,
        senderName,
        text,
        sentAt: serverTimestamp(),
      });

      // Fire-and-forget server action for notifications + metadata
      sendMessageNotificationAction({
        conversationId,
        senderId: user.uid,
        senderName,
        text,
      }).catch(console.error);
    } catch (error) {
      console.error('Error sending message:', error);
      setMessageText(text); // Restore on error
    } finally {
      setIsSending(false);
    }
  };

  // Build avatar lookup for message senders
  const getAvatarPlayer = useCallback((senderId: string) => {
    if (!conversation) return null;
    const name = conversation.participantNames?.[senderId] || 'Unknown';
    const [firstName = '', lastName = ''] = name.split(' ');
    return {
      id: senderId,
      firstName,
      lastName,
      avatarUrl: conversation.participantAvatars?.[senderId] || '',
      email: '',
    };
  }, [conversation]);

  return (
    <div className="flex flex-col h-full -m-4 md:-m-6">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b bg-background sticky top-0 z-10">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground truncate">{displayName}</p>
          {conversation?.type === 'group' && (
            <p className="text-xs text-muted-foreground">
              {conversation.participantIds.length} members
            </p>
          )}
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className={cn('flex items-end gap-2', i % 2 === 0 ? 'justify-start' : 'justify-end')}>
                {i % 2 === 0 && <Skeleton className="h-8 w-8 rounded-full" />}
                <Skeleton className="h-12 w-48 rounded-2xl" />
              </div>
            ))}
          </div>
        ) : messages && messages.length > 0 ? (
          <div className="space-y-3">
            {messages.map((msg) => {
              const isMe = msg.senderId === user?.uid;
              const avatarPlayer = !isMe ? getAvatarPlayer(msg.senderId) : null;
              const timeAgo = msg.sentAt
                ? formatDistanceToNow(
                    (msg.sentAt as any).toDate ? (msg.sentAt as any).toDate() : new Date(msg.sentAt as any),
                    { addSuffix: true }
                  )
                : '';

              return (
                <div
                  key={msg.id}
                  className={cn('flex items-end gap-2', isMe ? 'justify-end' : 'justify-start')}
                >
                  {!isMe && avatarPlayer && (
                    <UserAvatar player={avatarPlayer as any} className="h-8 w-8 shrink-0" />
                  )}
                  <div className={cn('max-w-xs md:max-w-md')}>
                    {!isMe && conversation?.type === 'group' && (
                      <p className="text-[10px] text-muted-foreground mb-0.5 ml-1">
                        {msg.senderName}
                      </p>
                    )}
                    <div
                      className={cn(
                        'rounded-2xl p-3 text-sm',
                        isMe
                          ? 'bg-primary text-primary-foreground rounded-br-none'
                          : 'bg-muted text-foreground rounded-bl-none'
                      )}
                    >
                      {msg.text}
                    </div>
                    <p className={cn(
                      'text-[10px] text-muted-foreground/60 mt-0.5',
                      isMe ? 'text-right mr-1' : 'ml-1'
                    )}>
                      {timeAgo}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <p className="text-sm text-muted-foreground">
              No messages yet. Send the first message!
            </p>
          </div>
        )}
      </ScrollArea>

      {/* Input bar */}
      <div className="border-t bg-background/80 backdrop-blur-sm p-4 pb-24">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <Input
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="Type a message..."
            className="flex-1"
            disabled={isSending}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!messageText.trim() || isSending}
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
