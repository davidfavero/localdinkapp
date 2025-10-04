import type { Player, Court, GameSession } from '@/lib/types';
import { PlaceHolderImages } from '@/lib/placeholder-images';

export const players: Player[] = [
  { id: 'p1', name: 'You', avatarUrl: PlaceHolderImages.find(p => p.id === 'user1')?.imageUrl || '', isCurrentUser: true },
  { id: 'p2', name: 'Alex Johnson', avatarUrl: PlaceHolderImages.find(p => p.id === 'user2')?.imageUrl || '' },
  { id: 'p3', name: 'Maria Garcia', avatarUrl: PlaceHolderImages.find(p => p.id === 'user3')?.imageUrl || '' },
  { id: 'p4', name: 'Chen Wei', avatarUrl: PlaceHolderImages.find(p => p.id === 'user4')?.imageUrl || '' },
  { id: 'p5', name: 'Sarah Miller', avatarUrl: PlaceHolderImages.find(p => p.id === 'user5')?.imageUrl || '' },
  { id: 'p6', name: 'David Smith', avatarUrl: PlaceHolderImages.find(p => p.id === 'user6')?.imageUrl || '' },
  { id: 'p7', name: 'Emily White', avatarUrl: PlaceHolderImages.find(p => p.id === 'user7')?.imageUrl || '' },
  { id: 'p8', name: 'James Brown', avatarUrl: PlaceHolderImages.find(p => p.id === 'user8')?.imageUrl || '' },
];

export const courts: Court[] = [
  { id: 'c1', name: 'Sunnyvale Park', location: 'Sunnyvale, CA', isHome: true, isFavorite: true },
  { id: 'c2', name: 'Mountain View Tennis', location: 'Mountain View, CA', isFavorite: true },
  { id: 'c3', name: 'Cupertino Sports Center', location: 'Cupertino, CA' },
  { id: 'c4', name: 'Mitchell Park', location: 'Palo Alto, CA', isFavorite: true },
];

export const gameSessions: GameSession[] = [
  {
    id: 'gs1',
    court: courts[0],
    organizer: players[1],
    date: 'Today',
    time: '5:00 PM',
    type: 'Doubles',
    players: [
      { player: players[1], status: 'CONFIRMED' },
      { player: players[2], status: 'CONFIRMED' },
      { player: players[3], status: 'CONFIRMED' },
      { player: players[0], status: 'CONFIRMED' },
    ],
    alternates: [players[6], players[7]],
  },
  {
    id: 'gs2',
    court: courts[1],
    organizer: players[0],
    date: 'Tomorrow',
    time: '10:00 AM',
    type: 'Doubles',
    players: [
      { player: players[0], status: 'CONFIRMED' },
      { player: players[4], status: 'CONFIRMED' },
      { player: players[5], status: 'PENDING' },
      { player: players[2], status: 'DECLINED' },
    ],
    alternates: [players[1], players[3]],
  },
  {
    id: 'gs3',
    court: courts[3],
    organizer: players[3],
    date: 'Friday',
    time: '6:30 PM',
    type: 'Singles',
    players: [
      { player: players[3], status: 'CONFIRMED' },
      { player: players[6], status: 'PENDING' },
    ],
    alternates: [],
  },
];
