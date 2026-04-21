'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ArrowLeft, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/user-avatar';
import { useUser, useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useDoc } from '@/firebase/firestore/use-doc';
import { collection, query, orderBy, doc, addDoc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { sendMessageNotificationAction } from '@/lib/actions';
import type { Conversation, ConversationMessage } from '@/lib/types';
import { format, isToday, isYesterday, isSameDay } from 'date-fns';

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

  // Fetch live user profiles for participants so names/avatars stay current
  const [liveProfiles, setLiveProfiles] = useState<Record<string, { firstName: string; lastName: string; avatarUrl: string }>>({});
  useEffect(() => {
    if (!firestore || !conversation?.participantIds) return;
    const otherIds = conversation.participantIds.filter(id => id !== user?.uid);
    if (otherIds.length === 0) return;

    let cancelled = false;
    (async () => {
      const profiles: typeof liveProfiles = {};
      for (const uid of otherIds) {
        try {
          // Strip player: prefix for document lookups
          const rawId = uid.startsWith('player:') ? uid.slice(7) : uid;
          
          // Try users collection first
          const snap = await getDoc(doc(firestore, 'users', rawId));
          if (snap.exists() && !cancelled) {
            const d = snap.data() as any;
            const name = `${d.firstName || ''} ${d.lastName || ''}`.trim();
            if (name) {
              profiles[uid] = { firstName: d.firstName || '', lastName: d.lastName || '', avatarUrl: d.avatarUrl || '' };
              continue;
            }
          }
          // Fallback: check players collection (for contacts/roster players)
          const playerSnap = await getDoc(doc(firestore, 'players', rawId));
          if (playerSnap.exists() && !cancelled) {
            const d = playerSnap.data() as any;
            const name = `${d.firstName || ''} ${d.lastName || ''}`.trim();
            if (name) {
              profiles[uid] = { firstName: d.firstName || '', lastName: d.lastName || '', avatarUrl: d.avatarUrl || '' };
            }
          }
        } catch { /* fall back to denormalized data */ }
      }
      if (!cancelled) setLiveProfiles(profiles);

      // Fire-and-forget: sync stale denormalized names/avatars on the conversation doc
      if (firestore && conversationId && Object.keys(profiles).length > 0) {
        const updates: Record<string, string> = {};
        for (const [uid, p] of Object.entries(profiles)) {
          const liveName = `${p.firstName} ${p.lastName}`.trim();
          if (liveName && liveName !== conversation?.participantNames?.[uid]) {
            updates[`participantNames.${uid}`] = liveName;
          }
          if (p.avatarUrl !== (conversation?.participantAvatars?.[uid] || '')) {
            updates[`participantAvatars.${uid}`] = p.avatarUrl;
          }
        }
        if (Object.keys(updates).length > 0) {
          updateDoc(doc(firestore, 'conversations', conversationId), updates).catch(() => {});
        }
      }
    })();
    return () => { cancelled = true; };
  }, [firestore, conversation?.participantIds, user?.uid]);

  // Display name for header
  const displayName = useMemo(() => {
    if (!conversation || !user) return '';
    if (conversation.type === 'group' && conversation.groupName) {
      return conversation.groupName;
    }
    const otherIds = conversation.participantIds.filter(id => id !== user.uid);
    return otherIds.map(id => {
      const live = liveProfiles[id];
      if (live) return `${live.firstName} ${live.lastName}`.trim();
      return conversation.participantNames?.[id] || 'Unknown';
    }).join(', ');
  }, [conversation, user, liveProfiles]);

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
    const live = liveProfiles[senderId];
    const firstName = live?.firstName || '';
    const lastName = live?.lastName || '';
    const avatarUrl = live?.avatarUrl || '';
    if (live) {
      return { id: senderId, firstName, lastName, avatarUrl, email: '' };
    }
    const name = conversation.participantNames?.[senderId] || 'Unknown';
    const [fn = '', ln = ''] = name.split(' ');
    return {
      id: senderId,
      firstName: fn,
      lastName: ln,
      avatarUrl: conversation.participantAvatars?.[senderId] || '',
      email: '',
    };
  }, [conversation, liveProfiles]);

  // Header avatar for the other participant (1:1)
  const headerAvatar = useMemo(() => {
    if (!conversation || !user || conversation.type === 'group') return null;
    const otherId = conversation.participantIds.find(id => id !== user.uid);
    if (!otherId) return null;
    return getAvatarPlayer(otherId);
  }, [conversation, user, getAvatarPlayer]);

  // Current user avatar
  const myAvatar = useMemo(() => {
    if (!currentUser) return null;
    return {
      id: user?.uid || '',
      firstName: currentUser.firstName || '',
      lastName: currentUser.lastName || '',
      avatarUrl: currentUser.avatarUrl || '',
      email: currentUser.email || '',
    };
  }, [currentUser, user]);

  // Helper: get a Date from a Firestore timestamp
  const toDate = (ts: any): Date | null => {
    if (!ts) return null;
    if (ts.toDate) return ts.toDate();
    return new Date(ts);
  };

  // Helper: format a section date header (Apple-style)
  const formatDateHeader = (date: Date): string => {
    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'EEEE, MMM d');
  };

  // Should we show a date separator before this message?
  const shouldShowDateSeparator = (msg: ConversationMessage, prevMsg?: ConversationMessage): boolean => {
    const msgDate = toDate(msg.sentAt);
    if (!msgDate) return false;
    if (!prevMsg) return true; // Always show for first message
    const prevDate = toDate(prevMsg.sentAt);
    if (!prevDate) return true;
    return !isSameDay(msgDate, prevDate);
  };

  // Should we show the avatar? (consecutive messages from same sender get grouped)
  const isLastInGroup = (msg: ConversationMessage, nextMsg?: ConversationMessage): boolean => {
    if (!nextMsg) return true;
    return nextMsg.senderId !== msg.senderId;
  };

  const isFirstInGroup = (msg: ConversationMessage, prevMsg?: ConversationMessage): boolean => {
    if (!prevMsg) return true;
    return prevMsg.senderId !== msg.senderId;
  };

  return (
    <div className="flex flex-col h-full -m-4 md:-m-6">
      {/* Header — with avatar like Apple/Telegram */}
      <div className="flex items-center gap-3 p-4 border-b bg-background sticky top-0 z-10">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        {headerAvatar ? (
          <UserAvatar player={headerAvatar as any} className="h-9 w-9 shrink-0" />
        ) : conversation?.type === 'group' ? (
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-xs font-semibold text-primary">
              {(conversation.groupName || 'G')[0].toUpperCase()}
            </span>
          </div>
        ) : null}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground truncate">{displayName}</p>
          {conversation?.type === 'group' && (
            <p className="text-xs text-muted-foreground">
              {conversation.participantIds.length} members
            </p>
          )}
        </div>
      </div>

      {/* Messages — native scroll like Robin chat */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
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
          <>
            {messages.map((msg, idx) => {
              const isMe = msg.senderId === user?.uid;
              const prevMsg = messages[idx - 1];
              const nextMsg = messages[idx + 1];
              const showDate = shouldShowDateSeparator(msg, prevMsg);
              const lastInGroup = isLastInGroup(msg, nextMsg);
              const firstInGroup = isFirstInGroup(msg, prevMsg);
              const avatarPlayer = !isMe ? getAvatarPlayer(msg.senderId) : null;
              const msgDate = toDate(msg.sentAt);

              return (
                <div key={msg.id}>
                  {/* Date separator — centered, Apple-style */}
                  {showDate && msgDate && (
                    <div className="flex justify-center my-4">
                      <span className="text-[11px] text-muted-foreground/70 bg-muted/60 px-3 py-1 rounded-full">
                        {formatDateHeader(msgDate)}
                      </span>
                    </div>
                  )}

                  <div
                    className={cn(
                      'flex items-end gap-2',
                      isMe ? 'justify-end' : 'justify-start',
                      lastInGroup ? 'mb-3' : 'mb-0.5'
                    )}
                  >
                    {/* Avatar — only on last message in a group (like Apple) */}
                    {!isMe && lastInGroup && avatarPlayer ? (
                      <UserAvatar player={avatarPlayer as any} className="h-8 w-8 shrink-0" />
                    ) : !isMe ? (
                      <div className="w-8 shrink-0" /> /* spacer for alignment */
                    ) : null}

                    <div className={cn('max-w-xs md:max-w-md')}>
                      {/* Sender name in group chats — only on first in group */}
                      {!isMe && conversation?.type === 'group' && firstInGroup && (
                        <p className="text-[11px] text-muted-foreground font-medium mb-0.5 ml-1">
                          {msg.senderName}
                        </p>
                      )}
                      <div
                        className={cn(
                          'rounded-2xl px-3 py-2 text-sm',
                          isMe
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-foreground',
                          // Tail on last message in group only
                          isMe && lastInGroup && 'rounded-br-none',
                          !isMe && lastInGroup && 'rounded-bl-none',
                        )}
                      >
                        {msg.text}
                      </div>
                      {/* Timestamp — only on last message in a group */}
                      {lastInGroup && msgDate && (
                        <p className={cn(
                          'text-[10px] text-muted-foreground/50 mt-0.5',
                          isMe ? 'text-right mr-1' : 'ml-1'
                        )}>
                          {format(msgDate, 'h:mm a')}
                        </p>
                      )}
                    </div>

                    {/* User avatar on right — only on last in group */}
                    {isMe && lastInGroup && myAvatar ? (
                      <UserAvatar player={myAvatar as any} className="h-8 w-8 shrink-0" />
                    ) : isMe ? (
                      <div className="w-8 shrink-0" />
                    ) : null}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <p className="text-sm text-muted-foreground">
              No messages yet. Say hello!
            </p>
          </div>
        )}
      </div>

      {/* Input bar — matches Robin chat */}
      <div className="bg-background/80 backdrop-blur-sm border-t p-4 pb-24">
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
            placeholder={`Message ${displayName || ''}...`}
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
