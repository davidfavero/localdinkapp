'use server';

import {
  extractProfilePreferences,
  type ProfilePreferenceExtractionInput,
  type ProfilePreferenceExtractionOutput,
} from "@/ai/flows/profile-preference-extraction";
import {
  handleCancellation,
  type HandleCancellationInput,
  type HandleCancellationOutput,
} from "@/ai/flows/automated-cancellation-management";
import { chat } from "@/ai/flows/chat";
import type { ChatInput, ChatOutput, Player } from "@/lib/types";
import { players as mockPlayers, courts as mockCourts } from "@/lib/data";
import { adminDb } from "@/firebase/admin";
import { sendSmsTool } from "@/ai/tools/sms";

/* =========================
   Helpers
   ========================= */

// 1) Confirmation handling: tolerant of variants & punctuation
function isConfirmation(message: string) {
  const m = message.toLowerCase().trim().replace(/[!.\s]+$/g, "");
  if (!m) return false;

  if (
    [
      "y","yes","yeah","yep","ok","okay","confirm","confirmed","do it","sure",
      "sounds good","go ahead","try again","i did, yes","i did",
    ].includes(m)
  ) return true;

  if (/^(y|yes|yeah|yep|ok|okay)\b/.test(m)) return true;
  if (/(sounds\s+good|looks\s+good|please\s+do|go\s+ahead|try\s+again|confirmed)/.test(m)) return true;

  return false;
}

// 2) Time parsing with ambiguity support
type ParsedTime = { hour: number; minute: number; ambiguous: boolean };
function parseTimeFlexible(input: string): ParsedTime {
  let s = input.trim().toUpperCase().replace(/\s+/g, "");
  let ampm: "AM" | "PM" | null = null;
  if (s.endsWith("AM")) { ampm = "AM"; s = s.slice(0, -2); }
  else if (s.endsWith("PM")) { ampm = "PM"; s = s.slice(0, -2); }

  if (/^\d{3,4}$/.test(s)) {
    if (s.length === 3) s = s[0] + ":" + s.slice(1);
    else s = s.slice(0, s.length - 2) + ":" + s.slice(-2);
  }

  let hour = 0, minute = 0;
  const m = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(s);
  if (m) {
    hour = Math.max(0, Math.min(12, parseInt(m[1], 10)));
    minute = m[2] ? Math.max(0, Math.min(59, parseInt(m[2], 10))) : 0;
  } else {
    return { hour: 0, minute: 0, ambiguous: true };
  }

  let ambiguous = false;
  if (ampm === null) {
    if (hour >= 6 && hour <= 11) ampm = "PM";
    else if (hour === 12) ampm = "PM";
    else ampm = "AM";
    ambiguous = true;
  }

  if (ampm === "PM" && hour < 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;

  return { hour, minute, ambiguous };
}

// Relative date helpers: supports "today", "tomorrow", or ISO "YYYY-MM-DD"
function resolveDateToYMD(dateStr: string): { y: number; m: number; d: number } | null {
  const now = new Date();
  const s = dateStr.trim().toLowerCase();

  if (s === "today") return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };

  if (s === "tomorrow") {
    const t = new Date(now);
    t.setDate(now.getDate() + 1);
    return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
  }

  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (m) return { y: parseInt(m[1], 10), m: parseInt(m[2], 10), d: parseInt(m[3], 10) };

  return null;
}

// 3) Safe local date construction
function toStartDateLocal(dateStr: string, timeStr: string): { date: Date; ambiguousTime: boolean } {
  const ymd = resolveDateToYMD(dateStr);
  const base = ymd ?? (() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
  })();

  const t = parseTimeFlexible(timeStr);
  const date = new Date(base.y, base.m - 1, base.d, t.hour, t.minute, 0, 0);
  return { date, ambiguousTime: t.ambiguous };
}

// 4) Names & display
function displayName(p: { firstName?: string; lastName?: string; name?: string }) {
  if (p.name) return p.name;
  const fn = (p.firstName ?? "").trim();
  const ln = (p.lastName ?? "").trim();
  return [fn, ln].filter(Boolean).join(" ") || "Unknown";
}

// 5) Game type & acceptance math
type GameType = "singles" | "doubles";
function determineGameType(currentUser: Player | null, totalPlayersMentioned: number): GameType {
  const defaultType = (currentUser as any)?.defaultGameType as GameType | undefined;
  if (defaultType === "singles" || defaultType === "doubles") return defaultType;
  return totalPlayersMentioned >= 4 ? "doubles" : "singles";
}

// 6) Court slug utility
function slugify(s: string) {
  return s.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "");
}


/* =========================
   Public actions
   ========================= */

export async function extractPreferencesAction(
  input: ProfilePreferenceExtractionInput
): Promise<ProfilePreferenceExtractionOutput> {
  try {
    return await extractProfilePreferences(input);
  } catch (error) {
    console.error("Error in extractPreferencesAction:", error);
    throw new Error("Failed to extract preferences with AI.");
  }
}

export async function handleCancellationAction(
  input: HandleCancellationInput
): Promise<HandleCancellationOutput> {
  try {
    return await handleCancellation(input);
  } catch (error) {
    console.error("Error in handleCancellationAction:", error);
    throw new Error("Failed to handle cancellation with AI.");
  }
}

export async function chatAction(input: ChatInput, currentUser: Player | null): Promise<ChatOutput> {
  // Load players with Admin SDK (bypasses security rules)
  const usersSnapshot = await adminDb.collection("users").get();
  const allPlayers: Player[] = [];
  usersSnapshot.forEach((userDoc) => {
    const data = userDoc.data() as any;
    allPlayers.push({
      id: userDoc.id,
      firstName: data.firstName ?? "",
      lastName: data.lastName ?? "",
      email: data.email ?? "",
      avatarUrl: data.avatarUrl ?? "",
      phone: data.phone ?? "",
      isCurrentUser: userDoc.id === currentUser?.id,
    } as Player);
  });

  try {
    // NLU + planning
    const result = await chat(allPlayers, input);
    const wasConfirmation = isConfirmation(input.message);

    // Only proceed to create/notify if we truly have enough info
    const hasAllInputs =
      !!result?.date && !!result?.time && !!result?.location &&
      Array.isArray(result?.invitedPlayers) && !!result?.currentUser;

    let confirmationText: string | undefined;

    if (wasConfirmation && hasAllInputs) {
      const { date, time, location, invitedPlayers } = result;

      // Build Date safely
      const { date: startDate } = toStartDateLocal(date!, time!);

      // Participants
      const organizerId = result.currentUser!.id!;
      const participantIds = Array.from(
        new Set(invitedPlayers!.map((p) => p.id).filter((id): id is string => !!id))
      );

      const otherPlayers = invitedPlayers!.filter((p) => p.id !== organizerId);
      const otherPlayerNames = otherPlayers.map(displayName).join(" and ");

      // Game type heuristic
      const gameType = determineGameType(result.currentUser!, invitedPlayers!.length ?? 0);

      // SMS body
      const smsBody =
        `Pickleball Game Invitation! You're invited to a ${gameType} game on ${date} at ${time} at ${location}. ` +
        `Reply YES or NO. Manage your profile at https://localdink.app/join`;

      // Send all SMS without failing the whole action on one error
      const smsResults = await Promise.allSettled(
        otherPlayers
          .filter((p) => !!p.phone)
          .map((p) => sendSmsTool({ to: String(p.phone), body: smsBody }))
      );

      const failedSms = smsResults.filter(r => r.status === "rejected").length;
      if (failedSms > 0) {
        console.warn(`SMS send failures: ${failedSms}/${smsResults.length}`);
      }

      // Save the game session (Admin SDK)
      try {
        const gameSessionsRef = adminDb.collection('game-sessions');
        await gameSessionsRef.add({
          courtId: location,              // If you later map names->IDs, swap here
          organizerId,
          startTime: startDate,           // Firestore stores JS Date as Timestamp
          isDoubles: gameType === 'doubles',
          durationMinutes: 120,
          status: 'scheduled',
          playerIds: participantIds,
          createdAt: new Date(),
        });

        confirmationText = otherPlayers.length > 0
          ? `Excellent. I notified ${otherPlayerNames} and scheduled your game.`
          : `Excellent. I have scheduled your game.`;

      } catch (e) {
        console.error("Failed to save game session to Firestore with Admin SDK", e);
        confirmationText =
          "I sent the invites, but saving the session failed. Please check your Games list.";
      }
    }

    // Do NOT mutate `result` if `ChatOutput` type doesn't include confirmationText
    return (confirmationText
      ? ({ ...result, confirmationText } as ChatOutput)
      : result
    );
  } catch (error) {
    console.error("Error in chatAction:", error);
    throw new Error("Failed to get response from AI.");
  }
}

/* =========================
   Seeding
   ========================= */

export async function seedDatabaseAction(): Promise<{
  success: boolean;
  message: string;
  usersAdded: number;
  courtsAdded: number;
}> {
  try {
    const usersRef = adminDb.collection('users');
    const courtsRef = adminDb.collection('courts');

    const [usersSnap, courtsSnap] = await Promise.all([
      usersRef.get(),
      courtsRef.get(),
    ]);

    let usersAdded = 0, courtsAdded = 0;
    const batch = adminDb.batch();

    if (usersSnap.empty) {
      for (const p of mockPlayers) {
        if (!p?.id) continue; // guard
        const docRef = usersRef.doc(p.id); // keep your fixed ids
        batch.set(docRef, {
          firstName: p.firstName ?? '',
          lastName: p.lastName ?? '',
          email: p.email ?? `${(p.firstName ?? 'player').toLowerCase()}.${(p.lastName ?? 'user').toLowerCase()}@example.com`,
          avatarUrl: p.avatarUrl ?? '',
          phone: p.phone ?? '',
          createdAt: new Date(),
        });
        usersAdded++;
      }
    }

    if (courtsSnap.empty) {
      for (const c of mockCourts) {
        const docRef = courtsRef.doc(); // auto id
        const name = c?.name ?? '';
        const location = c?.location ?? '';
        batch.set(docRef, {
          name,
          location,
          slug: slugify(name || location || docRef.id),
          createdAt: new Date(),
        });
        courtsAdded++;
      }
    }

    if (usersAdded === 0 && courtsAdded === 0) {
      return { success: true, message: 'Database already contains data.', usersAdded: 0, courtsAdded: 0 };
    }

    await batch.commit();
    return { success: true, message: `Added ${usersAdded} users & ${courtsAdded} courts.`, usersAdded, courtsAdded };
  } catch (err: any) {
    return {
      success: false,
      message: `Error seeding database: ${err?.message ?? String(err)}`,
      usersAdded: 0,
      courtsAdded: 0
    };
  }
}
