import "server-only";
import type { z } from "zod";
import type { homeCommandSchema } from "@/lib/validation/huset";
import { callService, getStates } from "./ha";
import { robotService } from "./robotControl";
import { CONTROLLABLE_SWITCHES } from "./rooms";
import { pinMatches } from "./switchPin";
import { toWatering } from "./watering";

// Utfører én handling fra knappene i Huset (og planlagte handlinger). Sjekker at enheten finnes og svarer,
// at bare brytere fra romkartet styres, og at «slå på» for brytere har riktig kode.
// Feil fra Home Assistant kastes videre (HaError).

export type ParsedHomeCommand = z.output<typeof homeCommandSchema>;

/** Litt ventetid ved feil kode, så den ikke kan prøves fram raskt. */
const WRONG_PIN_DELAY_MS = 1500;

export async function executeHomeCommand(cmd: ParsedHomeCommand): Promise<{ ok: boolean; message?: string }> {
  const states = new Map((await getStates()).map((s) => [s.entity_id, s]));
  const ids = cmd.action === "lights_off" || cmd.action === "lights_on" ? cmd.ids : [cmd.id];
  const known = ids.filter((id) => states.has(id) && states.get(id)!.state !== "unavailable");
  if (!known.length) return { ok: false, message: "Fant ikke enheten, eller den svarer ikke" };
  const entity_id = known[0];

  switch (cmd.action) {
    case "light":
      if (cmd.on === false) await callService("light", "turn_off", { entity_id });
      else
        await callService("light", "turn_on", {
          entity_id,
          ...(cmd.brightness !== undefined ? { brightness_pct: cmd.brightness } : {}),
          ...(cmd.kelvin !== undefined ? { color_temp_kelvin: cmd.kelvin } : {}),
        });
      break;
    case "lights_off":
      await callService("light", "turn_off", { entity_id: known });
      break;
    case "lights_on": {
      // Lys som bare kan slås av og på, får ikke lysstyrke (Home Assistant avviser det).
      const dimmable = known.filter((id) => {
        const modes = states.get(id)!.attributes.supported_color_modes;
        return Array.isArray(modes) && modes.some((m) => m !== "onoff");
      });
      const plain = known.filter((id) => !dimmable.includes(id));
      if (cmd.brightness !== undefined && dimmable.length) await callService("light", "turn_on", { entity_id: dimmable, brightness_pct: cmd.brightness });
      const rest = cmd.brightness !== undefined ? plain : known;
      if (rest.length) await callService("light", "turn_on", { entity_id: rest });
      break;
    }
    case "scene":
      await callService("scene", "turn_on", { entity_id });
      break;
    case "climate":
      await callService("climate", "set_temperature", { entity_id, temperature: cmd.temperature });
      break;
    case "cover":
      await callService("cover", cmd.command === "open" ? "open_cover" : cmd.command === "close" ? "close_cover" : "stop_cover", { entity_id });
      break;
    case "cover_position":
      await callService("cover", "set_cover_position", { entity_id, position: cmd.position });
      break;
    case "valve": {
      if (cmd.command === "close") {
        await callService("valve", "close_valve", { entity_id });
        break;
      }
      // Vanningstiden ligger i Gardena; settes den, brukes den når ventilen åpnes.
      const valve = toWatering([...states.values()]).valves.find((v) => v.id === entity_id);
      if (cmd.minutes !== undefined && valve?.durationId) {
        await callService("number", "set_value", { entity_id: valve.durationId, value: cmd.minutes });
      }
      await callService("valve", "open_valve", { entity_id });
      break;
    }
    case "switch":
      // Bare brytere fra romkartet: appen skal aldri slå av f.eks. strømmen til Miele-maskinene.
      if (!CONTROLLABLE_SWITCHES.has(entity_id)) return { ok: false, message: "Den bryteren kan ikke styres fra appen" };
      // Å slå på (varmekablene trekker mye strøm) krever koden; å slå av gjør det ikke.
      if (cmd.on) {
        const expected = process.env.HOUSE_SWITCH_PIN;
        if (!expected) return { ok: false, message: "Koden for å slå på er ikke satt opp ennå (HOUSE_SWITCH_PIN i Vercel)" };
        if (!pinMatches(cmd.pin, expected)) {
          // Litt ventetid ved feil kode, så den ikke kan prøves fram raskt.
          await new Promise((r) => setTimeout(r, WRONG_PIN_DELAY_MS));
          return { ok: false, message: cmd.pin ? "Feil kode" : "Skriv koden for å slå på" };
        }
      }
      await callService("switch", cmd.on ? "turn_on" : "turn_off", { entity_id });
      break;
    case "robot": {
      const service = robotService(entity_id, cmd.command);
      if (!service) return { ok: false, message: "Det kan ikke den roboten" };
      await callService(service.domain, service.service, { entity_id });
      break;
    }
  }
  return { ok: true };
}
