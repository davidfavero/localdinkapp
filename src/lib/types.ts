export type Player = {
  id: string;
  name: string;
  avatarUrl: string;
  isCurrentUser?: boolean;
};

export type Court = {
  id: string;
  name:string;
  location: string;
  isHome?: boolean;
  isFavorite?: boolean;
};

export type Group = {
  id: string;
  name: string;
  avatarUrl: string;
  members: Player[];
};

export type RsvpStatus = 'CONFIRMED' | 'DECLINED' | 'PENDING';

export type GameSession = {
  id: string;
  court: Court;
  organizer: Player;
  date: string;
  time: string;
  type: 'Singles' | 'Doubles' | 'Custom';
  players: {
    player: Player;
    status: RsvpStatus;
  }[];
  alternates: Player[];
};
