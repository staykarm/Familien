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

const entityOf = (domain: string) => z.string().regex(new RegExp(`^${domain}\\.[a-z0-9_]+$`), "Ukjent enhet");

/** Én handling på lys, scener, varme eller persienner. */
export const homeCommandSchema = z.discriminatedUnion("action", [
  /** Slå av/på, sett lysstyrke (1–100 %) og/eller fargetemperatur (kelvin). */
  z.object({
    action: z.literal("light"),
    id: entityOf("light"),
    on: z.boolean().optional(),
    brightness: z.number().int().min(1).max(100).optional(),
    kelvin: z.number().int().min(1500).max(9000).optional(),
  }),
  /** Slå av flere lys på én gang (et rom, utelys eller hele huset). */
  z.object({ action: z.literal("lights_off"), ids: z.array(entityOf("light")).min(1).max(200) }),
  /** Slå på flere lys (et rom), eventuelt med samme lysstyrke på alle som kan dimmes. */
  z.object({ action: z.literal("lights_on"), ids: z.array(entityOf("light")).min(1).max(200), brightness: z.number().int().min(1).max(100).optional() }),
  z.object({ action: z.literal("scene"), id: entityOf("scene") }),
  /** Ønsket temperatur, i halve grader. */
  z.object({ action: z.literal("climate"), id: entityOf("climate"), temperature: z.number().min(5).max(30).multipleOf(0.5) }),
  z.object({ action: z.literal("cover"), id: entityOf("cover"), command: z.enum(["open", "close", "stop"]) }),
  /** Posisjon 0–100 (0 = nede, 100 = oppe). */
  z.object({ action: z.literal("cover_position"), id: entityOf("cover"), position: z.number().int().min(0).max(100) }),
]);

export type HomeCommand = z.input<typeof homeCommandSchema>;

/** En beskjed til «Spør huset», med samtalen så langt (bare tekst). */
export const houseAgentSchema = z.object({
  text: z.string().trim().min(2, "Skriv eller si hva du vil gjøre").max(500, "Beskjeden er for lang"),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(2000) }))
    .max(12)
    .default([]),
});

const undoId = z.string().regex(/^(light|climate|cover|media_player)\.[a-z0-9_]+$/);

/** Det «Angre» setter tilbake. */
export const houseUndoSchema = z
  .array(
    z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("light"), id: undoId, on: z.boolean(), brightness: z.number().int().min(0).max(100).nullable(), kelvin: z.number().int().min(1500).max(9000).nullable() }),
      z.object({ kind: z.literal("climate"), id: undoId, target: z.number().min(5).max(30) }),
      z.object({ kind: z.literal("cover"), id: undoId, position: z.number().int().min(0).max(100) }),
      z.object({ kind: z.literal("speaker"), id: undoId, volume: z.number().int().min(0).max(100).nullable(), playing: z.boolean() }),
    ])
  )
  .min(1)
  .max(300);
