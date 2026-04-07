'use client';

import { useMemo, useRef, useState, useCallback } from 'react';
import { MessageCircle, Plus, Archive, Trash2, ArchiveRestore } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/user-avatar';
import { useUser, useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, orderBy, doc, updateDoc, arrayUnion, arrayRemove, deleteDoc } from 'firebase/firestore';
import type { Conversation } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

interface ConversationListProps {
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
}

function SwipeableConversationItem({
  conversation,
  currentUserId,
  onClick,
  onArchive,
  onDelete,
}: {
  conversation: Conversation;
  currentUserId: string;
  onClick: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const touchStartX = useRef(0);
  const touchCurrentX = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const isDragging = useRef(false);

  const ACTION_THRESHOLD = 80;
  const MAX_SWIPE = 160;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchCurrentX.current = e.touches[0].clientX;
    isDragging.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchCurrentX.current = e.touches[0].clientX;
    const diff = touchStartX.current - touchCurrentX.current;
    
    if (Math.abs(diff) > 10) {
      isDragging.current = true;
    }
    
    // Only allow left swipe (positive diff = swiping left to reveal actions)
    if (diff > 0) {
      const clamped = Math.min(diff, MAX_SWIPE);
      setSwipeOffset(clamped);
    } else if (isRevealed) {
      // Allow swiping back to close
      const clamped = Math.max(MAX_SWIPE + diff, 0);
      setSwipeOffset(clamped);
    }
  }, [isRevealed]);

  const handleTouchEnd = useCallback(() => {
    if (swipeOffset > ACTION_THRESHOLD) {
      // Snap open
      setSwipeOffset(MAX_SWIPE);
      setIsRevealed(true);
    } else {
      // Snap closed
      setSwipeOffset(0);
      setIsRevealed(false);
    }
  }, [swipeOffset]);

  const handleClick = useCallback(() => {
    if (isDragging.current) return;
    if (isRevealed) {
      setSwipeOffset(0);
      setIsRevealed(false);
      return;
    }
    onClick();
  }, [isRevealed, onClick]);

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

  const displayName = useMemo(() => {
    if (conversation.type === 'group' && conversation.groupName) {
      return conversation.groupName;
    }
    const otherIds = conversation.participantIds.filter(id => id !== currentUserId);
    return otherIds.map(id => conversation.participantNames?.[id] || 'Unknown').join(', ');
  }, [conversation, currentUserId]);

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
    <div ref={containerRef} className="relative overflow-hidden border-b">
      {/* Action buttons behind the swipeable content */}
      <div className="absolute right-0 top-0 bottom-0 flex h-full">
        <button
          onClick={(e) => { e.stopPropagation(); onArchive(); setSwipeOffset(0); setIsRevealed(false); }}
          className="flex items-center justify-center w-20 bg-blue-500 text-white transition-opacity"
          style={{ opacity: swipeOffset > 20 ? 1 : 0 }}
        >
          <div className="flex flex-col items-center gap-1">
            <Archive className="h-5 w-5" />
            <span className="text-[10px] font-medium">Archive</span>
          </div>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); setSwipeOffset(0); setIsRevealed(false); }}
          className="flex items-center justify-center w-20 bg-red-500 text-white transition-opacity"
          style={{ opacity: swipeOffset > 20 ? 1 : 0 }}
        >
          <div className="flex flex-col items-center gap-1">
            <Trash2 className="h-5 w-5" />
            <span className="text-[10px] font-medium">Delete</span>
          </div>
        </button>
      </div>

      {/* Swipeable foreground content */}
      <div
        className={cn(
          'relative bg-background transition-transform',
          swipeOffset === 0 && 'duration-200',
          swipeOffset === MAX_SWIPE && 'duration-200',
        )}
        style={{ transform: `translateX(-${swipeOffset}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
      >
        <div
          className={cn(
            'w-full flex items-center gap-3 p-4 text-left transition-colors hover:bg-muted/50',
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
        </div>
      </div>
    </div>
  );
}

export function ConversationList({ onSelectConversation, onNewConversation }: ConversationListProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [showArchived, setShowArchived] = useState(false);

  const conversationsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, 'conversations'),
      where('participantIds', 'array-contains', user.uid),
      orderBy('lastActivityAt', 'desc')
    );
  }, [firestore, user]);

  const { data: allConversations, isLoading } = useCollection<Conversation>(conversationsQuery);

  // Filter out deleted and optionally archived conversations
  const conversations = useMemo(() => {
    if (!allConversations || !user) return [];
    return allConversations.filter(c => {
      if (c.deletedBy?.includes(user.uid)) return false;
      if (!showArchived && c.archivedBy?.includes(user.uid)) return false;
      return true;
    });
  }, [allConversations, user, showArchived]);

  const archivedConversations = useMemo(() => {
    if (!allConversations || !user) return [];
    return allConversations.filter(c => 
      c.archivedBy?.includes(user.uid) && !c.deletedBy?.includes(user.uid)
    );
  }, [allConversations, user]);

  const handleArchive = async (conversationId: string) => {
    if (!firestore || !user) return;
    try {
      const convRef = doc(firestore, 'conversations', conversationId);
      await updateDoc(convRef, {
        archivedBy: arrayUnion(user.uid),
      });
      toast({ title: 'Archived', description: 'Conversation moved to archive.' });
    } catch (e) {
      console.error('Archive error:', e);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not archive conversation.' });
    }
  };

  const handleUnarchive = async (conversationId: string) => {
    if (!firestore || !user) return;
    try {
      const convRef = doc(firestore, 'conversations', conversationId);
      await updateDoc(convRef, {
        archivedBy: arrayRemove(user.uid),
      });
      toast({ title: 'Unarchived', description: 'Conversation restored.' });
    } catch (e) {
      console.error('Unarchive error:', e);
    }
  };

  const handleDelete = async (conversationId: string) => {
    if (!firestore || !user) return;
    try {
      const convRef = doc(firestore, 'conversations', conversationId);
      await updateDoc(convRef, {
        deletedBy: arrayUnion(user.uid),
      });
      toast({ title: 'Deleted', description: 'Conversation removed.' });
    } catch (e) {
      console.error('Delete error:', e);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not delete conversation.' });
    }
  };

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
        {archivedConversations.length > 0 && (
          <Button variant="ghost" size="sm" className="mt-4 text-muted-foreground" onClick={() => setShowArchived(true)}>
            <ArchiveRestore className="mr-1 h-4 w-4" />
            View {archivedConversations.length} archived
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full -m-4 md:-m-6">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-foreground">
            {showArchived ? 'Archived' : 'Conversations'}
          </h2>
          {showArchived && (
            <Button size="sm" variant="ghost" className="text-xs" onClick={() => setShowArchived(false)}>
              ← Back
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!showArchived && archivedConversations.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setShowArchived(true)} title="View archived">
              <Archive className="h-4 w-4" />
            </Button>
          )}
          {!showArchived && (
            <Button size="sm" variant="outline" onClick={onNewConversation}>
              <Plus className="mr-1 h-4 w-4" />
              New
            </Button>
          )}
        </div>
      </div>
      <ScrollArea className="flex-1">
        {showArchived ? (
          archivedConversations.length > 0 ? (
            archivedConversations.map(conversation => (
              <SwipeableConversationItem
                key={conversation.id}
                conversation={conversation}
                currentUserId={user!.uid}
                onClick={() => onSelectConversation(conversation.id)}
                onArchive={() => handleUnarchive(conversation.id)}
                onDelete={() => handleDelete(conversation.id)}
              />
            ))
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              <Archive className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No archived conversations</p>
            </div>
          )
        ) : (
          conversations.map(conversation => (
            <SwipeableConversationItem
              key={conversation.id}
              conversation={conversation}
              currentUserId={user!.uid}
              onClick={() => onSelectConversation(conversation.id)}
              onArchive={() => handleArchive(conversation.id)}
              onDelete={() => handleDelete(conversation.id)}
            />
          ))
        )}
      </ScrollArea>
    </div>
  );
}
