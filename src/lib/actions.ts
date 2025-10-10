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
import { Timestamp }from 'firebase-admin/firestore';
import { sendSmsTool } from "@/ai/tools/sms";

/* =========================
   Helpers
   ========================= */

// 1) Confirmation handling: tolerant of variants & punctuation
function isConfirmation(message: string) {
  const m = message.toLowerCase().trim().replace(/[!.\s]+$/g, "");
  if (!m) return false;

  // quick exact hits
  if (
    [
      "y",
      "yes",
      "yeah",
      "yep",
      "ok",
      "okay",
      "confirm",
      "confirmed",
      "do it",
      "sure",
      "sounds good",
      "go ahead",
      "try again",
      "i did, yes",
      "i did",
    ].includes(m)
  ) return true;

  // looser patterns (prefix/suffix forms)
  if (/^(y|yes|yeah|yep|ok|okay)\b/.test(m)) return true;
  if (/(sounds\s+good|looks\s+good|please\s+do|go\s+ahead|try\s+again|confirmed)/.test(m)) return true;

  return false;
}

// 2) Time parsing with ambiguity support
type ParsedTime = { hour: number; minute: number; ambiguous: boolean };
function parseTimeFlexible(input: string): ParsedTime {
  let s = input.trim().toUpperCase().replace(/\s+/g, "");
  // common forms: "7", "7PM", "7:30PM", "730PM", "7:30", "730"
  let ampm: "AM" | "PM" | null = null;
  if (s.endsWith("AM")) { ampm = "AM"; s = s.slice(0, -2); }
  else if (s.endsWith("PM")) { ampm = "PM"; s = s.slice(0, -2); }

  // insert colon if "730" → "7:30"
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
    // fallback: 7pm typed as "7 P M" or other oddity—default 0:00 ambiguous
    return { hour: 0, minute: 0, ambiguous: true };
  }

  let ambiguous = false;
  if (ampm === null) {
    // If missing AM/PM, make a pragmatic guess, but mark ambiguous so chat() can clarify.
    // Typical rec play often evenings; bias 6–11 → PM, 5–11 → AM if stated morning contexts upstream.
    // Here we choose: 6–11 → PM, otherwise AM, and flag as ambiguous.
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

  if (s === "today") {
    return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
  }
  if (s === "tomorrow") {
    const t = new Date(now);
    t.setDate(now.getDate() + 1);
    return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
  }
  // Simple "YYYY-MM-DD"
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (m) {
    return { y: parseInt(m[1], 10), m: parseInt(m[2], 10), d: parseInt(m[3], 10) };
  }
  return null;
}

// 3) Safe local date construction
function toStartDateLocal(dateStr: string, timeStr: string): { date: Date; ambiguousTime: boolean } {
  const ymd = resolveDateToYMD(dateStr);
  // If not recognizable, fall back to "today"
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
  // Fallback: if organizer mentions 4+ including self → doubles, else singles
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
  // Fetch contacts (players) once using the Admin SDK
  const usersSnapshot = await adminDb.collection("users").get();
  const allPlayers: Player[] = [];
  usersSnapshot.forEach((userDoc) => {
    const data = userDoc.data() as any;
    allPlayers.push({
      id: userDoc.id,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      avatarUrl: data.avatarUrl,
      phone: data.phone,
      isCurrentUser: userDoc.id === currentUser?.id,
    } as Player);
  });

  try {
    // Your chat flow should do primary NLU, disambiguation, etc.
    const result = await chat(allPlayers, input);

    const wasConfirmation = isConfirmation(input.message);

    // If we have a full instruction set and the organizer confirmed, save + notify
    if (
      wasConfirmation &&
      result.date &&
      result.time &&
      result.location &&
      result.invitedPlayers &&
      result.currentUser
    ) {
      const { date, time, location, invitedPlayers, currentUser } = result;

      // Build final Date safely; note if time was ambiguous
      const { date: startDate } = toStartDateLocal(date, time);

      // Prepare participant lists
      const organizerId = currentUser.id;
      const participantIds = Array.from(
        new Set(invitedPlayers.map((p) => p.id).filter((id): id is string => !!id))
      );

      const otherPlayers = invitedPlayers.filter((p) => p.id !== organizerId);
      const otherPlayerNames = otherPlayers.map(displayName).join(" and ");

      // Determine game type
      const gameType = determineGameType(currentUser, (invitedPlayers?.length ?? 0));

      // Notify invitees (concurrent SMS sends to avoid N+1 latency)
      const smsBody =
        `Pickleball Game Invitation! You're invited to a ${gameType} game on ${date} at ${time} at ${location}. ` +
        `Reply YES or NO. Manage your profile at https://localdink.app/join`;

      await Promise.all(
        otherPlayers
          .filter((p) => !!p.phone)
          .map((p) => sendSmsTool({ to: p.phone as string, body: smsBody }))
      );

      try {
        const gameSessionsRef = adminDb.collection('game-sessions');
        await gameSessionsRef.add({
          courtId: result.location, // Assuming location is court ID for now
          organizerId,
          startTime: startDate, // Admin SDK accepts JS Date objects
          isDoubles: gameType === 'doubles',
          durationMinutes: 120,
          status: 'scheduled',
          playerIds: participantIds,
        });

        result.confirmationText = otherPlayerNames
          ? `Excellent. I will notify ${otherPlayerNames} and get this scheduled right away.`
          : `Excellent. I have scheduled your game.`;

      } catch (e) {
        console.error("Failed to save game session to Firestore with Admin SDK", e);
        result.confirmationText =
          "I sent the invites, but saving the session failed. Please check your Games list.";
      }
    }

    return result;
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
    console.log('Admin project:', adminDb.app.options.projectId);
    const usersRef = adminDb.collection("users");
    const courtsRef = adminDb.collection("courts");

    const [usersSnap, courtsSnap] = await Promise.all([usersRef.get(), courtsRef.get()]);

    const batch = adminDb.batch();
    let usersAdded = 0;
    let courtsAdded = 0;

    if (usersSnap.empty) {
      for (const p of mockPlayers) {
        const docRef = usersRef.doc(p.id); // use your fixed ids
        batch.set(docRef, {
          firstName: p.firstName,
          lastName: p.lastName,
          email: `${p.firstName?.toLowerCase()}.${p.lastName?.toLowerCase()}@example.com`,
          avatarUrl: p.avatarUrl ?? "",
          phone: p.phone ?? "",
        });
        usersAdded++;
      }
    }

    if (courtsSnap.empty) {
      for (const c of mockCourts) {
        const docRef = courtsRef.doc(); // auto id
        batch.set(docRef, { 
          name: c.name, 
          location: c.location, 
          slug: slugify(c.name ?? c.location ?? docRef.id) 
        });
        courtsAdded++;
      }
    }

    if (usersAdded === 0 && courtsAdded === 0) {
      return { success: true, message: "Database already contains data.", usersAdded: 0, courtsAdded: 0 };
    }

    await batch.commit();
    return { success: true, message: `Successfully seeded database. Added ${usersAdded} users and ${courtsAdded} courts.`, usersAdded, courtsAdded };
  
  } catch (e: any) {
    console.error("Error seeding database:", e);
    // Check for a specific credential error to give a better message
    if (e.message.includes('Could not refresh access token') || e.code === 'auth/internal-error') {
       return { success: false, message: 'Database seeding failed: The Admin SDK is not authenticated. Please check your service account environment variables.', usersAdded: 0, courtsAdded: 0 };
    }
    return { success: false, message: `Error seeding database: ${e.message}`, usersAdded: 0, courtsAdded: 0 };
  }
}
