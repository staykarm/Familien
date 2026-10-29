import { z } from "zod";
import { SPOTIFY_URL } from "@/lib/huset/music";

const speakerId = z.string().regex(/^media_player\.[a-z0-9_]+$/, "Ukjent høyttaler");
const spotifyUrl = z.string().regex(SPOTIFY_URL, "Ukjent Spotify-lenke");

/** Én handling på en Sonos-høyttaler (eller gruppen den leder). */
export const speakerCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["toggle", "next", "previous"]), id: speakerId }),
  z.object({ action: z.literal("volume"), id: speakerId, volume: z.number().int().min(0).max(100) }),
  z.object({ action: z.literal("source"), id: speakerId, source: z.string().trim().min(1).max(200) }),
  /** Hvem som skal spille sammen med `id` (lederen). Tom liste = spill alene. */
  z.object({ action: z.literal("group"), id: speakerId, members: z.array(speakerId).max(30) }),
  /** Koble ett rom (`member`) til gruppen som `id` leder. */
  z.object({ action: z.literal("join"), id: speakerId, member: speakerId }),
  /** Ta rommet (og eventuelt flere, `also`) ut av gruppen, så de spiller for seg selv. */
  z.object({ action: z.literal("unjoin"), id: speakerId, also: z.array(speakerId).max(30).optional() }),
  /** Spill fra Spotify nå, eller legg i køen etter det som spilles. */
  z.object({ action: z.literal("play"), id: speakerId, url: spotifyUrl, queue: z.boolean().default(false) }),
]);

export type SpeakerCommand = z.input<typeof speakerCommandSchema>;

/** En fast gruppe av rom, med valgfri musikk og volum. */
export const houseGroupSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Gi gruppen et navn").max(40, "Navnet er for langt"),
  speakerIds: z.array(speakerId).min(1, "Velg minst ett rom").max(30),
  spotifyUrl: spotifyUrl.nullable(),
  spotifyName: z.string().trim().max(200).nullable(),
  volume: z.number().int().min(0).max(100).nullable(),
});

export type HouseGroupInput = z.input<typeof houseGroupSchema>;

export const musicQuerySchema = z.string().trim().min(2, "Skriv minst to tegn").max(100, "Søket er for langt");
