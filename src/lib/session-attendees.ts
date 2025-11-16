import type { AttendeeSource, GameSessionAttendee } from '@/lib/types';

const DEFAULT_SOURCE: AttendeeSource = 'user';

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const sanitizeAttendee = (id: string | null, source: AttendeeSource | null): GameSessionAttendee | null => {
  if (!id || !isNonEmptyString(id)) {
    return null;
  }

  const normalizedSource: AttendeeSource = source === 'player' ? 'player' : DEFAULT_SOURCE;
  return { id: id.trim(), source: normalizedSource };
};

const parseAttendeeString = (value: string): GameSessionAttendee => {
  const trimmed = value.trim();
  if (!trimmed.includes(':')) {
    return { id: trimmed, source: DEFAULT_SOURCE };
  }

  const [maybeSource, ...rest] = trimmed.split(':');
  const id = rest.join(':');
  if (!isNonEmptyString(id)) {
    return { id: trimmed, source: DEFAULT_SOURCE };
  }

  if (maybeSource === 'player' || maybeSource === 'user') {
    return { id, source: maybeSource };
  }

  return { id: trimmed, source: DEFAULT_SOURCE };
};

const coerceAttendee = (entry: any): GameSessionAttendee | null => {
  if (!entry) {
    return null;
  }

  if (typeof entry === 'string') {
    return parseAttendeeString(entry);
  }

  const idCandidate = [entry.id, entry.playerId, entry.uid, entry.value].find(isNonEmptyString) || null;
  const sourceCandidate: AttendeeSource | null = (() => {
    if (entry.source === 'player' || entry.source === 'user') {
      return entry.source;
    }
    if (entry.type === 'player' || entry.type === 'user') {
      return entry.type;
    }
    if (entry.collection === 'players') {
      return 'player';
    }
    return null;
  })();

  return sanitizeAttendee(idCandidate, sourceCandidate);
};

export const getAttendeeKey = (attendee: GameSessionAttendee): string =>
  `${attendee.source}:${attendee.id}`;

export const uniqueAttendees = (
  attendees: GameSessionAttendee[]
): GameSessionAttendee[] => {
  const map = new Map<string, GameSessionAttendee>();
  attendees.forEach((attendee) => {
    const normalized = sanitizeAttendee(attendee?.id ?? null, attendee?.source ?? null);
    if (!normalized) {
      return;
    }
    const key = getAttendeeKey(normalized);
    if (!map.has(key)) {
      map.set(key, normalized);
    }
  });
  return Array.from(map.values());
};

export const normalizeAttendees = (raw: {
  attendees?: any;
  playerIds?: any;
}): GameSessionAttendee[] => {
  const collected: GameSessionAttendee[] = [];

  if (Array.isArray(raw?.attendees)) {
    raw.attendees.forEach((entry) => {
      const coerced = coerceAttendee(entry);
      if (coerced) {
        collected.push(coerced);
      }
    });
  }

  if (Array.isArray(raw?.playerIds)) {
    raw.playerIds.forEach((value) => {
      if (!isNonEmptyString(value)) {
        return;
      }
      collected.push(parseAttendeeString(value));
    });
  }

  return uniqueAttendees(collected);
};

export const partitionAttendees = (attendees: GameSessionAttendee[]) => {
  const userIds = new Set<string>();
  const playerIds = new Set<string>();

  attendees.forEach((attendee) => {
    if (attendee.source === 'player') {
      playerIds.add(attendee.id);
    } else {
      userIds.add(attendee.id);
    }
  });

  return { userIds, playerIds };
};

export const createAttendee = (
  id: string,
  source: AttendeeSource = DEFAULT_SOURCE
): GameSessionAttendee => {
  const sanitized = sanitizeAttendee(id, source);
  if (!sanitized) {
    throw new Error('Cannot create attendee with empty id');
  }
  return sanitized;
};

export const mergeAttendees = (
  base: GameSessionAttendee[],
  additions: GameSessionAttendee[]
): GameSessionAttendee[] => uniqueAttendees([...base, ...additions]);
