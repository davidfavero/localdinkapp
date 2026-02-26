# LocalDink Product Roadmap

## Execution Order
1. Reliability Layer (current)
2. Coordination Layer
3. Conversation Layer

## 1) Reliability Layer
- [x] Add one-tap undo/edit for newly created sessions (10-minute undo window)
- [x] Add timezone fields for users and courts
- [x] Resolve relative dates with priority: `court.timezone` -> `user.timezone` -> default app timezone
- [x] Add persistent disambiguation memory per user
- [x] Add debug visibility for recent Robin actions and SMS outcomes

## 2) Coordination Layer
- [ ] Standing game templates
- [ ] Waitlist logic
- [ ] Auto-notify when spots open

## 3) Conversation Layer
- [ ] Threaded messages for game/group/direct
- [ ] In-app conversation-first experience
- [ ] SMS bridge for thread updates
