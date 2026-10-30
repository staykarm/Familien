import "server-only";
import { z } from "zod";
import { serverEnv } from "@/lib/env";

// Klient mot Home Assistant (REST-API-et). Kun server: tokenet skal aldri ut i nettleseren.
// Huset er bygd slik at det kan flyttes til en egen app senere, så denne filen bruker bare `lib/env`.

const TIMEOUT_MS = 8_000;

export const haStateSchema = z.object({
  entity_id: z.string(),
  state: z.string(),
  attributes: z.record(z.string(), z.unknown()),
  last_changed: z.string().optional(),
});

export type HaState = z.infer<typeof haStateSchema>;

export class HaError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null
  ) {
    super(message);
    this.name = "HaError";
  }
}

/** Om HA_URL og HA_TOKEN er satt. Uten dem viser siden en forklaring i stedet for å feile. */
export function haConfigured(): boolean {
  return !!process.env.HA_URL && !!process.env.HA_TOKEN;
}

function baseUrl(): string {
  return serverEnv("HA_URL").replace(/\/+$/, "");
}

/** Kaller Home Assistant med tokenet. Kaster HaError med norsk melding hvis den ikke svarer. */
export async function haFetch(path: string, init: RequestInit = {}, timeoutMs = TIMEOUT_MS): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(baseUrl() + path, {
      ...init,
      headers: { Authorization: `Bearer ${serverEnv("HA_TOKEN")}`, "Content-Type": "application/json", ...init.headers },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch {
    throw new HaError("Får ikke kontakt med Home Assistant");
  }
  if (res.status === 401 || res.status === 403) throw new HaError("Home Assistant godtar ikke tokenet (HA_TOKEN)", res.status);
  if (!res.ok) throw new HaError(`Home Assistant svarte med feil ${res.status}`, res.status);
  return res;
}

export async function getStates(timeoutMs?: number): Promise<HaState[]> {
  const res = await haFetch("/api/states", {}, timeoutMs);
  const parsed = z.array(haStateSchema).safeParse(await res.json());
  if (!parsed.success) throw new HaError("Uventet svar fra Home Assistant");
  return parsed.data;
}

export async function getState(entityId: string): Promise<HaState | null> {
  try {
    const res = await haFetch(`/api/states/${encodeURIComponent(entityId)}`);
    const parsed = haStateSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch (e) {
    if (e instanceof HaError && e.status === 404) return null;
    throw e;
  }
}

/** Kjører en tjeneste, f.eks. `media_player.volume_set`. */
export async function callService(domain: string, service: string, data: Record<string, unknown>): Promise<void> {
  await haFetch(`/api/services/${domain}/${service}`, { method: "POST", body: JSON.stringify(data) });
}

/** Kjører en tjeneste som svarer med data (`?return_response`), f.eks. `tibber.get_prices`. */
export async function callServiceForResponse(domain: string, service: string, data: Record<string, unknown>): Promise<unknown> {
  const res = await haFetch(`/api/services/${domain}/${service}?return_response`, { method: "POST", body: JSON.stringify(data) });
  const body = (await res.json()) as { service_response?: unknown };
  return body.service_response ?? null;
}

/** Historikken til én entitet fra `start` (ISO) til nå, uten attributter. Tomt hvis den ikke finnes. */
export async function getHistory(entityId: string, start: string): Promise<{ state: string; last_changed: string }[]> {
  const res = await haFetch(`/api/history/period/${encodeURIComponent(start)}?filter_entity_id=${encodeURIComponent(entityId)}&minimal_response&no_attributes`);
  const body = (await res.json()) as unknown;
  const list = Array.isArray(body) && Array.isArray(body[0]) ? (body[0] as { state?: unknown; last_changed?: unknown }[]) : [];
  return list.flatMap((p) => (typeof p.state === "string" && typeof p.last_changed === "string" ? [{ state: p.state, last_changed: p.last_changed }] : []));
}
