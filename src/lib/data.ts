import type { Player, Court, GameSession, Group } from '@/lib/types';
import { PlaceHolderImages } from '@/lib/placeholder-images';

// This file now primarily serves as a source for mock data for seeding the database.
// The application should fetch live data from Firestore instead of using these directly.

const allPlayers: Player[] = [
  { id: 'user-1', firstName: 'Robert', lastName: 'Smith', avatarUrl: PlaceHolderImages.find(p => p.id === 'user1')?.imageUrl || '', isCurrentUser: true, email: 'robert.smith@example.com', phone: '555-0101' },
  { id: 'user-2', firstName: 'Alex', lastName: 'Johnson', avatarUrl: PlaceHolderImages.find(p => p.id === 'user2')?.imageUrl || '', email: 'alex.johnson@example.com', phone: '404-538-9332' },
  { id: 'user-3', firstName: 'Maria', lastName: 'Garcia', avatarUrl: PlaceHolderImages.find(p => p.id === 'user3')?.imageUrl || '', email: 'maria.garcia@example.com', phone: '555-0103' },
  { id: 'user-4', firstName: 'Chen', lastName: 'Wei', avatarUrl: PlaceHolderImages.find(p => p.id === 'user4')?.imageUrl || '', email: 'chen.wei@example.com', phone: '555-0104' },
  { id: 'user-5', firstName: 'Sarah', lastName: 'Miller', avatarUrl: PlaceHolderImages.find(p => p.id === 'user5')?.imageUrl || '', email: 'sarah.miller@example.com', phone: '555-0105' },
  { id: 'user-6', firstName: 'David', lastName: 'Smith', avatarUrl: PlaceHolderImages.find(p => p.id === 'user6')?.imageUrl || '', email: 'david.smith@example.com', phone: '555-0106' },
  { id: 'user-7', firstName: 'Emily', lastName: 'White', avatarUrl: PlaceHolderImages.find(p => p.id === 'user7')?.imageUrl || '', email: 'emily.white@example.com', phone: '555-0107' },
  { id: 'user-8', firstName: 'James', lastName: 'Brown', avatarUrl: PlaceHolderImages.find(p => p.id === 'user8')?.imageUrl || '', email: 'james.brown@example.com', phone: '555-0108' },
];


export const players = allPlayers;


const seedOwnerId = 'seed-owner';

export const courts: Omit<Court, 'id'>[] = [
  { name: 'Sunnyvale Park', location: 'Sunnyvale, CA', isHome: true, isFavorite: true, ownerId: seedOwnerId },
  { name: 'Mountain View Tennis', location: 'Mountain View, CA', isFavorite: true, ownerId: seedOwnerId },
  { name: 'Cupertino Sports Center', location: 'Cupertino, CA', ownerId: seedOwnerId },
  { name: 'Mitchell Park', location: 'Palo Alto, CA', isFavorite: true, ownerId: seedOwnerId },
];

export const mockCourts = courts;

// The data below is for reference and potential future seeding, but is not currently used for seeding.
const referencePlayers: Player[] = allPlayers.map((p, i) => ({ ...p, id: `p${i+1}`, email: `${p.firstName}@example.com`}));

export const groups: Group[] = [
    {
        id: 'g1',
        name: 'Weekend Warriors',
        avatarUrl: PlaceHolderImages.find(p => p.id === 'group1')?.imageUrl || '',
        members: [referencePlayers[0].id, referencePlayers[1].id, referencePlayers[2].id, referencePlayers[4].id],
        ownerId: seedOwnerId,
        admins: [referencePlayers[0].id],
    },
    {
        id: 'g2',
        name: 'Morning Dinkers',
        avatarUrl: PlaceHolderImages.find(p => p.id === 'group2')?.imageUrl || '',
        members: [referencePlayers[3].id, referencePlayers[5].id, referencePlayers[6].id],
        ownerId: seedOwnerId,
        admins: [referencePlayers[3].id],
    },
    {
        id: 'g3',
        name: 'South Bay Paddlers',
        avatarUrl: PlaceHolderImages.find(p => p.id === 'group3')?.imageUrl || '',
        members: [referencePlayers[0].id, referencePlayers[2].id, referencePlayers[3].id, referencePlayers[5].id, referencePlayers[7].id],
        ownerId: seedOwnerId,
        admins: [referencePlayers[2].id],
    },
];

export const gameSessions: GameSession[] = [
  {
    id: 'gs1',
    court: { id: 'c1', name: 'Sunnyvale Park', location: 'Sunnyvale, CA', ownerId: seedOwnerId },
    organizer: referencePlayers[1],
    date: 'Today',
    time: '5:00 PM',
    type: 'Doubles',
    players: [
      { player: referencePlayers[1], status: 'CONFIRMED' },
      { player: referencePlayers[2], status: 'CONFIRMED' },
      { player: referencePlayers[3], status: 'CONFIRMED' },
      { player: referencePlayers[0], status: 'CONFIRMED' },
    ],
    alternates: [referencePlayers[6], referencePlayers[7]],
  },
  {
    id: 'gs2',
    court: { id: 'c2', name: 'Mountain View Tennis', location: 'Mountain View, CA', ownerId: seedOwnerId },
    organizer: referencePlayers[0],
    date: 'Tomorrow',
    time: '10:00 AM',
    type: 'Doubles',
    players: [
      { player: referencePlayers[0], status: 'CONFIRMED' },
      { player: referencePlayers[4], status: 'CONFIRMED' },
      { player: referencePlayers[5], status: 'PENDING' },
      { player: referencePlayers[2], status: 'DECLINED' },
    ],
    alternates: [referencePlayers[1], referencePlayers[3]],
  },
  {
    id: 'gs3',
    court: { id: 'c3', name: 'Mitchell Park', location: 'Palo Alto, CA', ownerId: seedOwnerId },
    organizer: referencePlayers[3],
    date: 'Friday',
    time: '6:30 PM',
    type: 'Singles',
    players: [
      { player: referencePlayers[3], status: 'CONFIRMED' },
      { player: referencePlayers[6], status: 'PENDING' },
    ],
    alternates: [],
  },
];
