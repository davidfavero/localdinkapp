import type { Player, Court, GameSession, Group } from '@/lib/types';
import { PlaceHolderImages } from '@/lib/placeholder-images';

export const players: Player[] = [
  { id: 'p1', name: 'Robert Smith', avatarUrl: PlaceHolderImages.find(p => p.id === 'user1')?.imageUrl || '', isCurrentUser: true, phone: '555-0101' },
  { id: 'p2', name: 'Alex Johnson', avatarUrl: PlaceHolderImages.find(p => p.id === 'user2')?.imageUrl || '', phone: '404-538-9332' },
  { id: 'p3', name: 'Maria Garcia', avatarUrl: PlaceHolderImages.find(p => p.id === 'user3')?.imageUrl || '', phone: '555-0103' },
  { id: 'p4', name: 'Chen Wei', avatarUrl: PlaceHolderImages.find(p => p.id === 'user4')?.imageUrl || '', phone: '555-0104' },
  { id: 'p5', name: 'Sarah Miller', avatarUrl: PlaceHolderImages.find(p => p.id === 'user5')?.imageUrl || '', phone: '555-0105' },
  { id: 'p6', name: 'David Smith', avatarUrl: PlaceHolderImages.find(p => p.id === 'user6')?.imageUrl || '', phone: '555-0106' },
  { id: 'p7', name: 'Emily White', avatarUrl: PlaceHolderImages.find(p => p.id === 'user7')?.imageUrl || '', phone: '555-0107' },
  { id: 'p8', name: 'James Brown', avatarUrl: PlaceHolderImages.find(p => p.id === 'user8')?.imageUrl || '', phone: '555-0108' },
];

export const courts: Court[] = [
  { id: 'c1', name: 'Sunnyvale Park', location: 'Sunnyvale, CA', isHome: true, isFavorite: true },
  { id: 'c2', name: 'Mountain View Tennis', location: 'Mountain View, CA', isFavorite: true },
  { id: 'c3', name: 'Cupertino Sports Center', location: 'Cupertino, CA' },
  { id: 'c4', name: 'Mitchell Park', location: 'Palo Alto, CA', isFavorite: true },
];

export const groups: Group[] = [
    { 
        id: 'g1', 
        name: 'Weekend Warriors', 
        avatarUrl: PlaceHolderImages.find(p => p.id === 'group1')?.imageUrl || '', 
        members: [players[0], players[1], players[2], players[4]] 
    },
    { 
        id: 'g2', 
        name: 'Morning Dinkers', 
        avatarUrl: PlaceHolderImages.find(p => p.id === 'group2')?.imageUrl || '', 
        members: [players[3], players[5], players[6]] 
    },
    { 
        id: 'g3', 
        name: 'South Bay Paddlers', 
        avatarUrl: PlaceHolderImages.find(p => p.id === 'group3')?.imageUrl || '', 
        members: [players[0], players[2], players[3], players[5], players[7]] 
    },
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
