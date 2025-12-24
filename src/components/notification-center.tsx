'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Calendar, 
  UserPlus, 
  UserMinus, 
  Clock, 
  MapPin, 
  XCircle,
  Bell,
  CheckCircle2,
  PartyPopper
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useUser, useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, orderBy, limit, doc, updateDoc, writeBatch } from 'firebase/firestore';
import type { Notification, NotificationType } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';

interface NotificationCenterProps {
  onClose?: () => void;
}

const notificationIcons: Record<NotificationType, typeof Calendar> = {
  GAME_INVITE: Calendar,
  GAME_INVITE_ACCEPTED: UserPlus,
  GAME_INVITE_DECLINED: UserMinus,
  GAME_REMINDER: Clock,
  GAME_CHANGED: MapPin,
  GAME_CANCELLED: XCircle,
  SPOT_AVAILABLE: PartyPopper,
  RSVP_EXPIRED: Clock,
};

const notificationColors: Record<NotificationType, string> = {
  GAME_INVITE: 'text-primary bg-primary/10',
  GAME_INVITE_ACCEPTED: 'text-green-600 bg-green-100',
  GAME_INVITE_DECLINED: 'text-orange-600 bg-orange-100',
  GAME_REMINDER: 'text-blue-600 bg-blue-100',
  GAME_CHANGED: 'text-purple-600 bg-purple-100',
  GAME_CANCELLED: 'text-red-600 bg-red-100',
  SPOT_AVAILABLE: 'text-green-600 bg-green-100',
  RSVP_EXPIRED: 'text-muted-foreground bg-muted',
};

function NotificationItem({ 
  notification, 
  onClick 
}: { 
  notification: Notification; 
  onClick: () => void;
}) {
  const Icon = notificationIcons[notification.type] || Bell;
  const colorClass = notificationColors[notification.type] || 'text-muted-foreground bg-muted';
  
  const timeAgo = useMemo(() => {
    if (!notification.createdAt) return '';
    const date = notification.createdAt.toDate?.() || new Date(notification.createdAt);
    return formatDistanceToNow(date, { addSuffix: true });
  }, [notification.createdAt]);

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-start gap-3 p-3 text-left transition-colors hover:bg-muted/50',
        !notification.read && 'bg-primary/5'
      )}
    >
      <div className={cn('p-2 rounded-full shrink-0', colorClass)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={cn(
            'text-sm font-medium truncate',
            !notification.read && 'text-foreground',
            notification.read && 'text-muted-foreground'
          )}>
            {notification.title}
          </p>
          {!notification.read && (
            <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />
          )}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
          {notification.body}
        </p>
        <p className="text-[10px] text-muted-foreground/70 mt-1">
          {timeAgo}
        </p>
      </div>
    </button>
  );
}

export function NotificationCenter({ onClose }: NotificationCenterProps) {
  const router = useRouter();
  const { user } = useUser();
  const firestore = useFirestore();
  
  // Query notifications for current user
  const notificationsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
  }, [firestore, user]);
  
  const { data: notifications, isLoading } = useCollection<Notification>(notificationsQuery);
  
  const unreadNotifications = useMemo(() => 
    notifications?.filter(n => !n.read) || [],
    [notifications]
  );
  
  const handleNotificationClick = async (notification: Notification) => {
    if (!firestore || !user) return;
    
    // Mark as read
    if (!notification.read) {
      const notifRef = doc(firestore, 'notifications', notification.id);
      await updateDoc(notifRef, { read: true });
    }
    
    // Navigate based on notification type
    if (notification.data?.gameSessionId) {
      router.push(`/dashboard/sessions/${notification.data.gameSessionId}`);
    } else {
      router.push('/dashboard/sessions');
    }
    
    onClose?.();
  };
  
  const handleMarkAllRead = async () => {
    if (!firestore || !user || unreadNotifications.length === 0) return;
    
    const batch = writeBatch(firestore);
    unreadNotifications.forEach(notification => {
      const notifRef = doc(firestore, 'notifications', notification.id);
      batch.update(notifRef, { read: true });
    });
    await batch.commit();
  };

  return (
    <div className="flex flex-col max-h-[70vh]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold text-foreground">Notifications</h3>
        {unreadNotifications.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={handleMarkAllRead}
          >
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Mark all read
          </Button>
        )}
      </div>
      
      {/* Notification List */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-8 text-center">
            <Bell className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2 animate-pulse" />
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        ) : notifications && notifications.length > 0 ? (
          <div className="divide-y">
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onClick={() => handleNotificationClick(notification)}
              />
            ))}
          </div>
        ) : (
          <div className="p-8 text-center">
            <PartyPopper className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">You're all caught up!</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              No new notifications
            </p>
          </div>
        )}
      </ScrollArea>
      
      {/* Footer */}
      {notifications && notifications.length > 0 && (
        <>
          <Separator />
          <div className="p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground"
              onClick={() => {
                router.push('/dashboard/profile');
                onClose?.();
              }}
            >
              Notification Settings
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

