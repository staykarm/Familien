import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import {
  describeHome,
  mergeUndo,
  targetClimates,
  targetCovers,
  targetLights,
  undoClimate,
  undoCover,
  undoLight,
  type Target,
  type UndoItem,
} from "./agentTargets";
import { callService, getStates, type HaState } from "./ha";
import { stepTarget, toHome, type HomeState } from "./home";
import { searchSpotify, spotifyConfigured } from "./spotify";
import { membersToRemove, pickLeader, toGroups, toSpeakers, withJoined, withUnjoined, type Speaker } from "./sonos";

// «Spør huset»: Claude tolker en beskjed («skru av lyset i stua») og bruker verktøyene under.
// Verktøyene styrer bare det som finnes i Huset (romkartet og Sonos), med de samme sjekkene som knappene.

/** Rask modell, så svaret kommer på et par sekunder. Kan overstyres med ANTHROPIC_HOUSE_MODEL. */
const DEFAULT_MODEL = "claude-haiku-5-5";
const MAX_STEPS = 6;

export interface AgentTurn {
  role: "user" | "assistant";
  text: string;
}

export interface AgentResult {
  reply: string;
  /** Det som faktisk ble gjort, kort («Slo av 4 lys i Stue»). */
  actions: string[];
  /** Det som trengs for å sette alt tilbake. */
  undo: UndoItem[];
}

export interface PresetLite {
  id: string;
  name: string;
  speakerIds: string[];
}

const SYSTEM = `Du er «Huset», en hjelper som styrer huset til en norsk familie: lys, varme, persienner og musikk (Sonos).
Du får en oversikt over huset akkurat nå, og en beskjed fra noen i familien (skrevet eller sagt). Bruk verktøyene for å gjøre det de ber om.

Slik tolker du beskjeder:
- Bruk rom-id-ene og id-ene i hakeparentes fra oversikten. «Stua» = rommet stue, «oppe» = 2. etasje, «nede» = 1. etasje, «ute» = floors: ["ute"].
- «Alt lys» / «hele huset» = all: true. Ellers gjelder beskjeden bare rommene, etasjene eller enhetene som er nevnt.
- «Dimme» gjelder lysene som allerede er på (only_lit: true), med mindre de ber deg slå på. Uten tall: 30 %. «Litt» = 10 prosentpoeng.
- «Varmere/kaldere» uten tall = 0,5 grader opp eller ned (change).
- Musikk: bruk høyttalerne i rommet som er nevnt. Sonos-favoritter (f.eks. NRK P3) spilles med action "favorite". Ellers søk på Spotify med action "spotify" og et kort søk (artist, sang, sjanger eller spilleliste).
- Når du starter musikk, gjør det i ett kall: ta med volume i samme kall hvis volum er nevnt (det settes før musikken starter). Rommet tas automatisk ut av en gruppe med andre rom, så du trenger ikke group_speakers først.
- Gjør bare det som er bedt om. Er beskjeden uklar eller finnes ikke rommet/enheten, spør kort eller si fra, i stedet for å gjette.
- Du kan ikke styre dører, låser, alarmer eller noe som ikke står i oversikten.

Svar alltid på norsk (bokmål), kort, én eller to setninger, og si hva du gjorde: «Slo av 4 lys i stua.» Ingen lister, ingen markdown.`;

const targetSchema = {
  type: "object",
  description: "Hvor det skal skje. Bruk minst ett av feltene.",
  properties: {
    rooms: { type: "array", items: { type: "string" }, description: "Rom-id-er fra oversikten, f.eks. stue" },
    floors: { type: "array", items: { enum: [1, 2, "ute"] }, description: "Etasjer: 1, 2 eller \"ute\"" },
    ids: { type: "array", items: { type: "string" }, description: "Enkelte enheter (id i hakeparentes)" },
    all: { type: "boolean", description: "Hele huset" },
  },
  additionalProperties: false,
} as const;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "set_lights",
    description: "Slå lys av eller på, og sett eventuelt lysstyrke og fargetemperatur.",
    input_schema: {
      type: "object",
      properties: {
        target: targetSchema,
        on: { type: "boolean", description: "true = på (eller dimme), false = av" },
        brightness: { type: "integer", minimum: 1, maximum: 100, description: "Lysstyrke i prosent" },
        change: { type: "integer", minimum: -100, maximum: 100, description: "Endre lysstyrken med så mange prosentpoeng (f.eks. -10)" },
        kelvin: { type: "integer", minimum: 2000, maximum: 6500, description: "Fargetemperatur: 2200 = varmt, 4000 = nøytralt, 6000 = kaldt" },
        only_lit: { type: "boolean", description: "Bare lys som allerede er på (bruk ved dimming)" },
      },
      required: ["target", "on"],
      additionalProperties: false,
    },
  },
  {
    name: "activate_scene",
    description: "Start en Hue-scene i et rom.",
    input_schema: {
      type: "object",
      properties: { scene_id: { type: "string" } },
      required: ["scene_id"],
      additionalProperties: false,
    },
  },
  {
    name: "set_temperature",
    description: "Sett ønsket temperatur (i halve grader), eller endre den.",
    input_schema: {
      type: "object",
      properties: {
        target: targetSchema,
        temperature: { type: "number", minimum: 5, maximum: 30 },
        change: { type: "number", minimum: -5, maximum: 5, description: "Endring i grader, f.eks. 0.5 eller -1" },
      },
      required: ["target"],
      additionalProperties: false,
    },
  },
  {
    name: "set_covers",
    description: "Persienner opp, ned, stopp, eller til en posisjon (0 = nede, 100 = oppe).",
    input_schema: {
      type: "object",
      properties: {
        target: targetSchema,
        action: { enum: ["open", "close", "stop", "position"] },
        position: { type: "integer", minimum: 0, maximum: 100 },
      },
      required: ["target", "action"],
      additionalProperties: false,
    },
  },
  {
    name: "control_music",
    description:
      "Musikk på Sonos: spill, pause, neste, forrige, volum (eller endring), en Sonos-favoritt, eller søk og spill fra Spotify. Gjelder gruppen høyttaleren spiller i.",
    input_schema: {
      type: "object",
      properties: {
        speakers: { type: "array", items: { type: "string" }, description: "Høyttaler-id-er (media_player.*)" },
        action: { enum: ["play", "pause", "next", "previous", "volume", "favorite", "spotify"] },
        volume: { type: "integer", minimum: 0, maximum: 100, description: "Volum. Med favorite/spotify settes det før musikken starter." },
        change: { type: "integer", minimum: -50, maximum: 50, description: "Endre volumet med så mange prosentpoeng" },
        favorite: { type: "string", description: "Navnet på en Sonos-favoritt" },
        query: { type: "string", description: "Spotify-søk" },
        kind: { enum: ["track", "playlist", "album"], description: "Hva du søker etter på Spotify" },
      },
      required: ["speakers", "action"],
      additionalProperties: false,
    },
  },
  {
    name: "group_speakers",
    description: "Koble høyttalere sammen så de spiller det samme, eller ta dem ut av gruppen (alone: true).",
    input_schema: {
      type: "object",
      properties: {
        speakers: { type: "array", items: { type: "string" } },
        alone: { type: "boolean", description: "true = hver høyttaler spiller for seg selv" },
      },
      required: ["speakers"],
      additionalProperties: false,
    },
  },
  {
    name: "start_house_group",
    description: "Start en av de faste gruppene (kobler rommene og setter eventuelt musikk og volum).",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
];

// Inndata fra Claude valideres alltid før noe styres.
const target = z.object({
  rooms: z.array(z.string()).max(40).optional(),
  floors: z.array(z.union([z.literal(1), z.literal(2), z.literal("ute")])).max(3).optional(),
  ids: z.array(z.string()).max(200).optional(),
  all: z.boolean().optional(),
});
const inputs = {
  set_lights: z.object({
    target,
    on: z.boolean(),
    brightness: z.number().int().min(1).max(100).optional(),
    change: z.number().int().min(-100).max(100).optional(),
    kelvin: z.number().int().min(1500).max(9000).optional(),
    only_lit: z.boolean().optional(),
  }),
  activate_scene: z.object({ scene_id: z.string() }),
  set_temperature: z.object({ target, temperature: z.number().min(5).max(30).optional(), change: z.number().min(-5).max(5).optional() }),
  set_covers: z.object({ target, action: z.enum(["open", "close", "stop", "position"]), position: z.number().int().min(0).max(100).optional() }),
  control_music: z.object({
    speakers: z.array(z.string()).min(1).max(30),
    action: z.enum(["play", "pause", "next", "previous", "volume", "favorite", "spotify"]),
    volume: z.number().int().min(0).max(100).optional(),
    change: z.number().int().min(-50).max(50).optional(),
    favorite: z.string().max(200).optional(),
    query: z.string().max(200).optional(),
    kind: z.enum(["track", "playlist", "album"]).optional(),
  }),
  group_speakers: z.object({ speakers: z.array(z.string()).min(1).max(30), alone: z.boolean().optional() }),
  start_house_group: z.object({ id: z.string() }),
};

interface Context {
  home: HomeState;
  speakers: Speaker[];
  presets: (PresetLite & { spotifyUrl: string | null; volume: number | null })[];
  actions: string[];
  undo: UndoItem[];
}

const roomNames = (home: HomeState, t: Target) =>
  t.all ? "hele huset" : [...(t.rooms ?? []).map((id) => home.rooms.find((r) => r.id === id)?.name ?? id), ...(t.floors ?? []).map((f) => (f === "ute" ? "ute" : `${f}. etg`))].join(", ");

async function runTool(name: string, raw: unknown, ctx: Context): Promise<string> {
  switch (name) {
    case "set_lights": {
      const p = inputs.set_lights.parse(raw);
      const lights = targetLights(ctx.home, p.target, p.only_lit ?? false);
      if (!lights.length) return "Fant ingen lys som passer (eller ingen som er på).";
      ctx.undo.push(...lights.map(undoLight));
      const ids = lights.map((l) => l.id);
      if (!p.on) {
        await callService("light", "turn_off", { entity_id: ids });
        ctx.actions.push(`Slo av ${ids.length} lys (${roomNames(ctx.home, p.target) || "valgte lys"})`);
        return `Slo av ${ids.length} lys.`;
      }
      const dimmable = lights.filter((l) => l.dimmable);
      const plain = lights.filter((l) => !l.dimmable).map((l) => l.id);
      if (p.change !== undefined) {
        for (const l of dimmable) {
          const next = Math.min(100, Math.max(1, (l.on ? (l.brightness ?? 50) : 0) + p.change));
          await callService("light", "turn_on", { entity_id: l.id, brightness_pct: next });
        }
      } else if (p.brightness !== undefined && dimmable.length) {
        await callService("light", "turn_on", { entity_id: dimmable.map((l) => l.id), brightness_pct: p.brightness });
      } else if (dimmable.length) {
        await callService("light", "turn_on", { entity_id: dimmable.map((l) => l.id) });
      }
      if (plain.length) await callService("light", "turn_on", { entity_id: plain });
      const warm = p.kelvin === undefined ? [] : lights.filter((l) => l.kelvin);
      if (warm.length) await callService("light", "turn_on", { entity_id: warm.map((l) => l.id), color_temp_kelvin: p.kelvin });
      const level = p.brightness !== undefined ? ` til ${p.brightness} %` : p.change !== undefined ? ` (${p.change > 0 ? "+" : ""}${p.change} %)` : "";
      ctx.actions.push(`Satte ${ids.length} lys${level} (${roomNames(ctx.home, p.target) || "valgte lys"})`);
      return `Ferdig: ${ids.length} lys${level}.`;
    }
    case "activate_scene": {
      const p = inputs.activate_scene.parse(raw);
      const room = ctx.home.rooms.find((r) => r.scenes.some((s) => s.id === p.scene_id));
      const scene = room?.scenes.find((s) => s.id === p.scene_id);
      if (!room || !scene) return "Fant ikke scenen.";
      ctx.undo.push(...room.lights.filter((l) => l.available).map(undoLight));
      await callService("scene", "turn_on", { entity_id: scene.id });
      ctx.actions.push(`Startet scenen ${scene.name} (${room.name})`);
      return `Startet ${scene.name}.`;
    }
    case "set_temperature": {
      const p = inputs.set_temperature.parse(raw);
      const climates = targetClimates(ctx.home, p.target);
      if (!climates.length) return "Fant ingen termostater som passer.";
      if (p.temperature === undefined && p.change === undefined) return "Si hvilken temperatur eller hvor mye den skal endres.";
      const done: string[] = [];
      for (const c of climates) {
        const next = p.temperature !== undefined ? Math.round(p.temperature * 2) / 2 : stepTarget(c, p.change ?? 0);
        if (next === null) continue;
        const u = undoClimate(c);
        if (u) ctx.undo.push(u);
        await callService("climate", "set_temperature", { entity_id: c.id, temperature: next });
        done.push(`${c.name} ${next.toLocaleString("nb-NO")} °C`);
      }
      ctx.actions.push(`Varme: ${done.join(", ")}`);
      return `Satte ${done.join(", ")}.`;
    }
    case "set_covers": {
      const p = inputs.set_covers.parse(raw);
      const covers = targetCovers(ctx.home, p.target);
      if (!covers.length) return "Fant ingen persienner som passer.";
      for (const c of covers) {
        const u = undoCover(c);
        if (u) ctx.undo.push(u);
      }
      const ids = covers.map((c) => c.id);
      if (p.action === "position") {
        if (p.position === undefined) return "Si hvor langt opp persiennene skal stå.";
        await callService("cover", "set_cover_position", { entity_id: ids, position: p.position });
      } else {
        await callService("cover", p.action === "open" ? "open_cover" : p.action === "close" ? "close_cover" : "stop_cover", { entity_id: ids });
      }
      const verb = { open: "Kjørte opp", close: "Kjørte ned", stop: "Stoppet", position: `Satte til ${p.position} % oppe:` }[p.action];
      ctx.actions.push(`${verb} ${ids.length} persienner (${roomNames(ctx.home, p.target) || "valgte"})`);
      return `${verb} ${ids.length} persienner.`;
    }
    case "control_music": {
      const p = inputs.control_music.parse(raw);
      let chosen = ctx.speakers.filter((s) => p.speakers.includes(s.id) && s.status !== "unavailable");
      if (!chosen.length) return "Fant ingen høyttalere som svarer.";
      const names = chosen.map((s) => s.name).join(", ");
      const startsMusic = p.action === "spotify" || p.action === "favorite";
      if (startsMusic) {
        // Ny musikk skal bare spille der det er bedt om. Er rommet med i en gruppe med andre rom, tas det ut først
        // (ellers ville musikken startet i hele gruppen, med volumet der).
        const wanted = new Set(chosen.map((s) => s.id));
        const leave = chosen.filter((s) => s.groupMembers.some((id) => !wanted.has(id))).map((s) => s.id);
        if (leave.length) {
          await callService("media_player", "unjoin", { entity_id: leave });
          ctx.speakers = withUnjoined(ctx.speakers, leave);
          chosen = ctx.speakers.filter((s) => wanted.has(s.id));
          ctx.actions.push(`Tok ut av gruppen: ${leave.map((id) => ctx.speakers.find((s) => s.id === id)!.name).join(", ")}`);
        }
        // Volum som er nevnt, settes før musikken starter, så den aldri begynner for høyt.
        if (p.volume !== undefined) {
          for (const s of chosen) ctx.undo.push(speakerUndo(ctx, s.id));
          await callService("media_player", "volume_set", { entity_id: chosen.map((s) => s.id), volume_level: p.volume / 100 });
          ctx.actions.push(`Volum ${p.volume}: ${names}`);
        }
      }
      // Avspilling styres av lederen i gruppen høyttaleren er med i (etter eventuelle endringer over).
      const groups = toGroups(ctx.speakers);
      const leaders = [...new Set(chosen.map((s) => groups.find((g) => g.speakers.some((x) => x.id === s.id))?.leader.id ?? s.id))];
      switch (p.action) {
        case "play":
        case "pause":
          for (const s of leaders) ctx.undo.push(speakerUndo(ctx, s));
          await callService("media_player", p.action === "play" ? "media_play" : "media_pause", { entity_id: leaders });
          ctx.actions.push(`${p.action === "play" ? "Spiller" : "Pause"}: ${names}`);
          return "Ferdig.";
        case "next":
        case "previous":
          await callService("media_player", p.action === "next" ? "media_next_track" : "media_previous_track", { entity_id: leaders });
          ctx.actions.push(`${p.action === "next" ? "Neste sang" : "Forrige sang"}: ${names}`);
          return "Ferdig.";
        case "volume": {
          if (p.volume === undefined && p.change === undefined) return "Si hvilket volum.";
          for (const s of chosen) {
            ctx.undo.push(speakerUndo(ctx, s.id));
            const next = p.volume ?? Math.min(100, Math.max(0, (s.volume ?? 20) + (p.change ?? 0)));
            await callService("media_player", "volume_set", { entity_id: s.id, volume_level: next / 100 });
          }
          ctx.actions.push(`Volum ${p.volume !== undefined ? p.volume : `${p.change! > 0 ? "+" : ""}${p.change}`}: ${names}`);
          return "Ferdig.";
        }
        case "favorite": {
          const fav = p.favorite?.trim().toLowerCase();
          for (const id of leaders) {
            const s = ctx.speakers.find((x) => x.id === id)!;
            const source = s.sources.find((x) => x.toLowerCase() === fav) ?? s.sources.find((x) => fav && x.toLowerCase().includes(fav));
            if (!source) return `Fant ikke favoritten «${p.favorite}». Favorittene er: ${s.sources.join(", ")}.`;
            ctx.undo.push(speakerUndo(ctx, id));
            await callService("media_player", "select_source", { entity_id: id, source });
          }
          ctx.actions.push(`Spiller ${p.favorite}: ${names}`);
          return "Ferdig.";
        }
        case "spotify": {
          if (!spotifyConfigured()) return "Spotify er ikke satt opp i Familien ennå.";
          if (!p.query?.trim()) return "Si hva som skal spilles.";
          const found = await searchSpotify(p.query.trim());
          const kind = p.kind ?? "track";
          const item = (kind === "playlist" ? found.playlists : kind === "album" ? found.albums : found.tracks)[0] ?? found.tracks[0] ?? found.playlists[0];
          if (!item) return `Fant ingenting på Spotify for «${p.query}».`;
          for (const id of leaders) {
            ctx.undo.push(speakerUndo(ctx, id));
            await callService("media_player", "play_media", { entity_id: id, media_content_id: item.url, media_content_type: "music" });
          }
          const what = [item.name, item.subtitle].filter(Boolean).join(" – ");
          ctx.actions.push(`Spiller «${what}»: ${names}`);
          return `Spiller «${what}».`;
        }
      }
      return "Ukjent handling.";
    }
    case "group_speakers": {
      const p = inputs.group_speakers.parse(raw);
      const ids = p.speakers.filter((id) => ctx.speakers.some((s) => s.id === id && s.status !== "unavailable"));
      if (!ids.length) return "Fant ingen høyttalere som svarer.";
      const names = ids.map((id) => ctx.speakers.find((s) => s.id === id)!.name).join(", ");
      if (p.alone) {
        await callService("media_player", "unjoin", { entity_id: ids });
        ctx.speakers = withUnjoined(ctx.speakers, ids);
        ctx.actions.push(`Spiller hver for seg: ${names}`);
        return "Ferdig.";
      }
      if (ids.length < 2) return "Velg minst to høyttalere.";
      const leader = pickLeader(ctx.speakers, ids)!;
      const group = toGroups(ctx.speakers).find((g) => g.leader.id === leader);
      const remove = group ? membersToRemove(group, ids) : [];
      if (remove.length) await callService("media_player", "unjoin", { entity_id: remove });
      await callService("media_player", "join", { entity_id: leader, group_members: ids.filter((id) => id !== leader) });
      ctx.speakers = withJoined(withUnjoined(ctx.speakers, remove), leader, ids);
      ctx.actions.push(`Spiller sammen: ${names}`);
      return "Ferdig.";
    }
    case "start_house_group": {
      const p = inputs.start_house_group.parse(raw);
      const preset = ctx.presets.find((x) => x.id === p.id);
      if (!preset) return "Fant ikke den faste gruppen.";
      const ids = preset.speakerIds.filter((id) => ctx.speakers.some((s) => s.id === id && s.status !== "unavailable"));
      const leader = pickLeader(ctx.speakers, ids);
      if (!leader) return "Ingen av rommene i gruppen svarer.";
      for (const id of ids) ctx.undo.push(speakerUndo(ctx, id));
      const others = ids.filter((id) => id !== leader);
      if (others.length) {
        await callService("media_player", "join", { entity_id: leader, group_members: others });
        ctx.speakers = withJoined(ctx.speakers, leader, others);
      }
      if (preset.volume !== null) await callService("media_player", "volume_set", { entity_id: ids, volume_level: preset.volume / 100 });
      if (preset.spotifyUrl) await callService("media_player", "play_media", { entity_id: leader, media_content_id: preset.spotifyUrl, media_content_type: "music" });
      ctx.actions.push(`Startet ${preset.name}`);
      return `Startet ${preset.name}.`;
    }
  }
  return `Ukjent verktøy: ${name}`;
}

function speakerUndo(ctx: Context, id: string): UndoItem {
  const s = ctx.speakers.find((x) => x.id === id);
  return { kind: "speaker", id, volume: s?.volume ?? null, playing: s?.status === "playing" };
}

/**
 * Kjører én beskjed: Claude får oversikten over huset og samtalen så langt, og bruker verktøyene til den er ferdig.
 * `history` er tidligere beskjeder og svar (bare tekst), så man kan følge opp («og på kjøkkenet også»).
 */
export async function askHouse(history: AgentTurn[], text: string, presets: Context["presets"]): Promise<AgentResult> {
  const states = await getStates();
  const ctx: Context = { home: toHome(states), speakers: toSpeakers(states), presets, actions: [], undo: [] };
  const overview = describeHome(ctx.home, ctx.speakers, presets);

  const client = new Anthropic({ apiKey: serverEnv("ANTHROPIC_API_KEY") });
  const messages: Anthropic.MessageParam[] = [
    ...history.map((t) => ({ role: t.role, content: t.text })),
    { role: "user", content: `Slik er huset nå:\n${overview}\n\nBeskjed: ${text}` },
  ];

  let reply = "";
  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_HOUSE_MODEL || DEFAULT_MODEL,
      max_tokens: 4000,
      output_config: { effort: "low" },
      // Systemteksten og verktøyene er like hver gang, så de kan bufres.
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason === "refusal") {
      reply = "Det kan jeg ikke hjelpe med.";
      break;
    }
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(" ").trim();
    if (text) reply = text;
    if (response.stop_reason !== "tool_use") break;

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      try {
        results.push({ type: "tool_result", tool_use_id: block.id, content: await runTool(block.name, block.input, ctx) });
      } catch (e) {
        const message = e instanceof z.ZodError ? `Ugyldige verdier: ${e.issues[0]?.message ?? ""}` : e instanceof Error ? e.message : "Noe gikk galt";
        results.push({ type: "tool_result", tool_use_id: block.id, content: message, is_error: true });
      }
    }
    // Alle resultatene i én melding, så Claude kan gjøre flere ting samtidig.
    messages.push({ role: "user", content: results });
  }

  return { reply: reply || (ctx.actions.length ? "Ferdig." : "Jeg skjønte ikke helt. Prøv å si det på en annen måte."), actions: ctx.actions, undo: mergeUndo(ctx.undo) };
}

/** Setter tilbake det «Spør huset» endret. Bare enheter som finnes og svarer, røres. */
export async function undoHouse(items: UndoItem[]): Promise<number> {
  const states = new Map((await getStates()).map((s): [string, HaState] => [s.entity_id, s]));
  let done = 0;
  for (const item of items) {
    const s = states.get(item.id);
    if (!s || s.state === "unavailable") continue;
    switch (item.kind) {
      case "light":
        if (!item.on) await callService("light", "turn_off", { entity_id: item.id });
        else
          await callService("light", "turn_on", {
            entity_id: item.id,
            ...(item.brightness !== null ? { brightness_pct: item.brightness } : {}),
            ...(item.kelvin !== null ? { color_temp_kelvin: item.kelvin } : {}),
          });
        break;
      case "climate":
        await callService("climate", "set_temperature", { entity_id: item.id, temperature: item.target });
        break;
      case "cover":
        await callService("cover", "set_cover_position", { entity_id: item.id, position: item.position });
        break;
      case "speaker":
        if (item.volume !== null) await callService("media_player", "volume_set", { entity_id: item.id, volume_level: item.volume / 100 });
        await callService("media_player", item.playing ? "media_play" : "media_pause", { entity_id: item.id });
        break;
    }
    done++;
  }
  return done;
}
