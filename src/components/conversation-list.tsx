'use client';

import { useMemo } from 'react';
import { MessageCircle, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/user-avatar';
import { useUser, useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, orderBy } from 'firebase/firestore';
import type { Conversation } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';

interface ConversationListProps {
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
}

function ConversationItem({
  conversation,
  currentUserId,
  onClick,
}: {
  conversation: Conversation;
  currentUserId: string;
  onClick: () => void;
}) {
  const isUnread = useMemo(() => {
    if (!conversation.lastMessage?.sentAt) return false;
    if (conversation.lastMessage.senderId === currentUserId) return false;
    const lastRead = conversation.lastReadAt?.[currentUserId];
    if (!lastRead) return true;
    const lastReadMs = (lastRead as any).toMillis ? (lastRead as any).toMillis() : 0;
    const lastMsgMs = (conversation.lastMessage.sentAt as any).toMillis
      ? (conversation.lastMessage.sentAt as any).toMillis()
      : 0;
    return lastMsgMs > lastReadMs;
  }, [conversation, currentUserId]);

  const timeAgo = useMemo(() => {
    const ts = conversation.lastMessage?.sentAt || conversation.lastActivityAt;
    if (!ts) return '';
    const date = (ts as any).toDate ? (ts as any).toDate() : new Date(ts as any);
    return formatDistanceToNow(date, { addSuffix: true });
  }, [conversation.lastMessage?.sentAt, conversation.lastActivityAt]);

  // Display name: other participant (1:1) or group name
  const displayName = useMemo(() => {
    if (conversation.type === 'group' && conversation.groupName) {
      return conversation.groupName;
    }
    const otherIds = conversation.participantIds.filter(id => id !== currentUserId);
    return otherIds.map(id => conversation.participantNames?.[id] || 'Unknown').join(', ');
  }, [conversation, currentUserId]);

  // Avatar player object for 1:1
  const avatarPlayer = useMemo(() => {
    if (conversation.type === '1:1') {
      const otherId = conversation.participantIds.find(id => id !== currentUserId);
      if (otherId) {
        const name = conversation.participantNames?.[otherId] || 'Unknown';
        const [firstName = '', lastName = ''] = name.split(' ');
        return {
          id: otherId,
          firstName,
          lastName,
          avatarUrl: conversation.participantAvatars?.[otherId] || '',
          email: '',
        };
      }
    }
    return null;
  }, [conversation, currentUserId]);

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 p-4 text-left transition-colors hover:bg-muted/50 border-b',
        isUnread && 'bg-primary/5'
      )}
    >
      {avatarPlayer ? (
        <UserAvatar player={avatarPlayer as any} className="h-10 w-10 shrink-0" />
      ) : (
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <MessageCircle className="h-5 w-5 text-primary" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className={cn(
            'text-sm truncate',
            isUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground'
          )}>
            {displayName}
          </p>
          <span className="text-[10px] text-muted-foreground/70 shrink-0">
            {timeAgo}
          </span>
        </div>
        {conversation.lastMessage && (
          <p className={cn(
            'text-xs truncate mt-0.5',
            isUnread ? 'text-foreground' : 'text-muted-foreground'
          )}>
            {conversation.lastMessage.senderId === currentUserId ? 'You: ' : ''}
            {conversation.lastMessage.text}
          </p>
        )}
      </div>
      {isUnread && (
        <span className="h-2.5 w-2.5 rounded-full bg-primary shrink-0" />
      )}
    </button>
  );
}

export function ConversationList({ onSelectConversation, onNewConversation }: ConversationListProps) {
  const { user } = useUser();
  const firestore = useFirestore();

  const conversationsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, 'conversations'),
      where('participantIds', 'array-contains', user.uid),
      orderBy('lastActivityAt', 'desc')
    );
  }, [firestore, user]);

  const { data: conversations, isLoading } = useCollection<Conversation>(conversationsQuery);

  if (isLoading) {
    return (
      <div className="space-y-1">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!conversations || conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <MessageCircle className="w-16 h-16 text-muted-foreground/30 mb-4" />
        <h2 className="text-lg font-semibold text-foreground mb-2">No conversations yet</h2>
        <p className="text-sm text-muted-foreground mb-6 max-w-xs">
          Start a conversation with a player or group to get chatting.
        </p>
        <Button onClick={onNewConversation}>
          <Plus className="mr-2 h-4 w-4" />
          New Conversation
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full -m-4 md:-m-6">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="font-semibold text-foreground">Conversations</h2>
        <Button size="sm" variant="outline" onClick={onNewConversation}>
          <Plus className="mr-1 h-4 w-4" />
          New
        </Button>
      </div>
      <ScrollArea className="flex-1">
        {conversations.map(conversation => (
          <ConversationItem
            key={conversation.id}
            conversation={conversation}
            currentUserId={user!.uid}
            onClick={() => onSelectConversation(conversation.id)}
          />
        ))}
      </ScrollArea>
    </div>
  );
}
