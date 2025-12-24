# LocalDink Notification System Specification

## Overview
A cross-platform notification system supporting In-App notifications (notification center + toasts) and SMS, with user preferences for channel selection.

---

## Architecture

### Channels
| Channel | Web | iOS App (Future) | Android App (Future) |
|---------|-----|------------------|----------------------|
| **In-App Center** | ✅ Firestore real-time | ✅ Same | ✅ Same |
| **Toast/Banner** | ✅ Client-side | ✅ Same | ✅ Same |
| **Push (FCM)** | ✅ (except iOS Safari*) | ✅ FCM + APNs | ✅ FCM |
| **SMS (Twilio)** | ✅ | ✅ | ✅ |

*iOS Safari requires PWA installed to home screen (iOS 16.4+)

### Data Model

#### User Notification Preferences (in `users` collection)
```typescript
notificationPreferences: {
  channels: {
    inApp: boolean;      // Notification center + toasts (default: true)
    push: boolean;       // Browser/device push (default: false until enabled)
    sms: boolean;        // SMS messages (default: false until phone verified)
  };
  types: {
    gameInvites: boolean;     // Direct invitations (default: true)
    gameReminders: boolean;   // Upcoming game reminders (default: true)
    rsvpUpdates: boolean;     // When players respond (default: true)
    gameChanges: boolean;     // Time/location changes (default: true)
    spotAvailable: boolean;   // Waitlist promotions (default: true)
  };
  quietHours?: {
    enabled: boolean;
    start: string;  // "22:00"
    end: string;    // "08:00"
    timezone: string;
  };
}
```

#### Notifications Collection (`notifications/{notificationId}`)
```typescript
{
  id: string;
  userId: string;           // Recipient user ID
  type: NotificationType;
  title: string;
  body: string;
  data: {                   // Structured payload
    gameSessionId?: string;
    inviterId?: string;
    action?: 'accept' | 'decline' | 'view';
  };
  read: boolean;
  createdAt: Timestamp;
  expiresAt?: Timestamp;    // Auto-delete after this time
  channels: ('inApp' | 'push' | 'sms')[];  // Which channels were used
}
```

---

## MVP: Flow A — Direct Invitation

### State Machine
```
INVITED → ACCEPTED → CONFIRMED
       → DECLINED
       → EXPIRED (no response by deadline)
```

### Notification Triggers

| Event | Trigger | Recipients | Channels |
|-------|---------|------------|----------|
| A1: Invite Sent | Game created with invitees | Each invitee | In-App, SMS (if enabled) |
| A2: Accepted | Invitee taps Accept | Invitee (confirmation), Organizer | In-App |
| A3: Declined | Invitee taps Decline | Organizer | In-App |
| A4: Reminder | T-2 hours before game | Pending invitees | In-App, SMS |
| A5: Expired | RSVP deadline passed | Organizer, Invitee | In-App |

### Copy Templates

#### A1: Invite Sent
**In-App Title:** Game invite from [inviterName]
**In-App Body:** [matchType] on [date] at [time] • [courtName]
**SMS:** 🏓 [inviterName] invited you to play [matchType] on [date] at [time] at [courtName]. Reply Y to accept, N to decline, or tap: [webLinkView]
**Actions:** Accept | Decline | View Details

#### A2: Accepted (to Invitee)
**In-App Title:** You're in! 🎉
**In-App Body:** [matchType] confirmed for [date] at [time] at [courtName]
**SMS:** ✅ Confirmed! You're playing [matchType] on [date] at [time] at [courtName]. See you there!

#### A2: Accepted (to Organizer)
**In-App Title:** [inviteeName] is in!
**In-App Body:** Accepted your [matchType] invite for [date]

#### A3: Declined (to Organizer)
**In-App Title:** [inviteeName] can't make it
**In-App Body:** Declined your [matchType] invite for [date]

#### A4: Reminder
**In-App Title:** Game starting soon!
**In-App Body:** [matchType] in 2 hours at [courtName]. Still need your RSVP!
**SMS:** ⏰ Reminder: [matchType] at [courtName] starts in 2 hours! Reply Y to confirm or N to decline: [webLinkView]

#### A5: Expired (to Invitee)
**In-App Title:** Invite expired
**In-App Body:** The invite to [matchType] on [date] has expired

---

## UI Components

### 1. Notification Bell (Header)
- Bell icon with unread count badge
- Click opens notification center dropdown/sheet
- Badge shows count of unread notifications (max "9+")

### 2. Notification Center (Dropdown/Sheet)
- List of recent notifications (last 30 days)
- Each item shows: icon, title, body, time ago, read/unread state
- Click notification → navigate to relevant page + mark as read
- "Mark all as read" action
- Empty state: "You're all caught up! 🎉"

### 3. Toast Notifications
- Appears top-right on new notifications
- Auto-dismiss after 5 seconds
- Click to view details
- Can be dismissed

### 4. Notification Preferences (Profile Page)
- Toggle for each channel: In-App, SMS
- Toggle for each notification type
- Phone number display/edit for SMS

---

## Implementation Plan (MVP)

### Phase 1: Data & Types
1. Add `NotificationPreferences` to Player type
2. Create `Notification` type
3. Update Firestore rules for notifications collection

### Phase 2: UI Components  
1. Create NotificationBell component
2. Create NotificationCenter component
3. Create notification toast hook
4. Add bell to dashboard header

### Phase 3: Preferences
1. Add notification preferences to profile page
2. Add notification preferences to wizard flow
3. Default preferences on user creation

### Phase 4: Sending Notifications
1. Create notification service (server-side)
2. Integrate with game session creation
3. SMS sending via existing Twilio setup

### Phase 5: FCM (Future)
1. Set up Firebase Cloud Messaging
2. Service worker for web push
3. Request push permission flow

---

## Placeholders Reference

- `[inviteeName]` - Name of person being invited
- `[inviterName]` - Name of person sending invite (organizer)
- `[matchType]` - Singles/Doubles/Mixed/Open Play
- `[date]` - e.g., "Tomorrow", "Friday, Dec 27"
- `[time]` - e.g., "4:00 PM"
- `[courtName]` - Name of the court
- `[webLinkView]` - Web URL to view/respond to invite

