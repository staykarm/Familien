// Takluka: bare visning – appen kan aldri åpne eller lukke den.
// I KNX er luka to reléer, «Åpne» og «Lukke», med tilbakemelding (binary_sensor i Home Assistant). Om luka står
// åpen, ses av hvilket relé som gikk sist. Finnes en kontaktsensor på luka, brukes den i stedet.
// Rene funksjoner uten nettverk, slik at de kan testes.

interface StateLike {
  entity_id: string;
  state: string;
  last_changed?: string;
}

export interface HatchConfig {
  /** binary_sensor for reléet «Åpne» (KNX 5/1/9). */
  open: string;
  /** binary_sensor for reléet «Lukke» (KNX 5/1/10). */
  close: string;
  /** Kontaktsensor på luka (on = åpen), hvis den finnes. Den går foran reléene. */
  contact?: string;
}

export interface Hatch {
  state: "open" | "closed" | "opening" | "closing" | "unknown";
  /** «Åpen», «Lukket», «Åpner …» */
  text: string;
  /** Når den sist endret seg (ISO). */
  since: string | null;
  /** Sikker status fra kontaktsensor, eller anslått ut fra reléene. */
  fromContact: boolean;
}

const TEXT: Record<Hatch["state"], string> = { open: "Åpen", closed: "Lukket", opening: "Åpner …", closing: "Lukker …", unknown: "Ukjent" };

const make = (state: Hatch["state"], since: string | null, fromContact: boolean): Hatch => ({ state, text: TEXT[state], since, fromContact });

/** Status for luka, eller null hvis Home Assistant ikke har sensorene. */
export function toHatch(states: StateLike[], config: HatchConfig): Hatch | null {
  const byId = new Map(states.map((s) => [s.entity_id, s]));
  const known = (s: StateLike | undefined) => !!s && s.state !== "unavailable" && s.state !== "unknown";

  const contact = config.contact ? byId.get(config.contact) : undefined;
  if (known(contact)) return make(contact!.state === "on" ? "open" : "closed", contact!.last_changed ?? null, true);

  const open = byId.get(config.open);
  const close = byId.get(config.close);
  if (!known(open) && !known(close)) return null;
  if (open?.state === "on") return make("opening", open.last_changed ?? null, false);
  if (close?.state === "on") return make("closing", close.last_changed ?? null, false);
  // Begge av: det reléet som slo seg av sist, var det siste som gikk.
  const t = (s: StateLike | undefined) => (s?.last_changed ? Date.parse(s.last_changed) : 0);
  if (!t(open) && !t(close)) return make("unknown", null, false);
  return t(open) > t(close) ? make("open", open!.last_changed ?? null, false) : make("closed", close?.last_changed ?? null, false);
}
