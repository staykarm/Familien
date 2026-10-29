import { z } from "zod";

const speakerId = z.string().regex(/^media_player\.[a-z0-9_]+$/, "Ukjent høyttaler");

/** Én handling på en Sonos-høyttaler (eller gruppen den leder). */
export const speakerCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["toggle", "next", "previous"]), id: speakerId }),
  z.object({ action: z.literal("volume"), id: speakerId, volume: z.number().int().min(0).max(100) }),
  z.object({ action: z.literal("source"), id: speakerId, source: z.string().trim().min(1).max(200) }),
  /** Hvem som skal spille sammen med `id` (lederen). Tom liste = spill alene. */
  z.object({ action: z.literal("group"), id: speakerId, members: z.array(speakerId).max(30) }),
]);

export type SpeakerCommand = z.input<typeof speakerCommandSchema>;
