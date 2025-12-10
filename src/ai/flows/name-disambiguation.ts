'use server';

/**
 * @fileOverview Name disambiguation using simple string matching.
 * No AI needed - just match first names to known players.
 */

export type NameDisambiguationInput = {
  playerName: string;
  knownPlayers: string[]; // Array of full names like "Melissa Favero"
};

export type NameDisambiguationOutput = {
  disambiguatedName?: string;
  question?: string;
};

/**
 * Disambiguates a player name against a list of known players.
 * Uses simple string matching - no AI required.
 */
export async function disambiguateName(
  input: NameDisambiguationInput
): Promise<NameDisambiguationOutput> {
  const { playerName, knownPlayers } = input;
  const searchName = playerName.toLowerCase().trim();
  
  console.log(`[disambiguate] Looking for "${searchName}" in:`, knownPlayers);

  // Try exact full name match first (case-insensitive)
  const exactMatch = knownPlayers.find(
    fullName => fullName.toLowerCase().trim() === searchName
  );
  if (exactMatch) {
    console.log(`[disambiguate] Exact match: "${exactMatch}"`);
    return { disambiguatedName: exactMatch };
  }

  // Try matching by first name only
  const firstNameMatches = knownPlayers.filter(fullName => {
    const firstName = fullName.split(' ')[0].toLowerCase().trim();
    return firstName === searchName;
  });

  if (firstNameMatches.length === 1) {
    // Exactly one match - use it without asking
    console.log(`[disambiguate] Single first name match: "${firstNameMatches[0]}"`);
    return { disambiguatedName: firstNameMatches[0] };
  }

  if (firstNameMatches.length > 1) {
    // Multiple matches - need clarification
    console.log(`[disambiguate] Multiple matches:`, firstNameMatches);
    return {
      question: `Do you mean ${firstNameMatches.join(' or ')}?`,
    };
  }

  // Try partial match (name contains search term or vice versa)
  const partialMatches = knownPlayers.filter(fullName => {
    const lowerName = fullName.toLowerCase();
    return lowerName.includes(searchName) || searchName.includes(lowerName.split(' ')[0]);
  });

  if (partialMatches.length === 1) {
    console.log(`[disambiguate] Partial match: "${partialMatches[0]}"`);
    return { disambiguatedName: partialMatches[0] };
  }

  if (partialMatches.length > 1) {
    console.log(`[disambiguate] Multiple partial matches:`, partialMatches);
    return {
      question: `Do you mean ${partialMatches.join(' or ')}?`,
    };
  }

  // No match found - ask for phone number to add new player
  console.log(`[disambiguate] No match found for "${playerName}"`);
  return {
    question: `I don't know ${playerName}. To add them to your contacts, please provide their phone number.`,
  };
}
