// Ferie: lysene går av og på som om noen er hjemme (logikken ligger i Home Assistant, packages/ferie.yaml i
// home-assistant-config). Familien slår bare bryteren av og på og viser status.
// Rene funksjoner uten nettverk, slik at de kan testes.

export const VACATION_ENTITY = "input_boolean.ferie";

export interface Vacation {
  on: boolean;
  /** Ferie virker bare når alarmen står på «borte». */
  active: boolean;
}

interface StateLike {
  entity_id: string;
  state: string;
}

/** Ferie-bryteren og om den virker nå (alarmen på borte). Null hvis Home Assistant ikke har den ennå. */
export function toVacation(states: StateLike[]): Vacation | null {
  const s = states.find((x) => x.entity_id === VACATION_ENTITY);
  if (!s || s.state === "unavailable" || s.state === "unknown") return null;
  const alarm = states.find((x) => x.entity_id.startsWith("alarm_control_panel."));
  const on = s.state === "on";
  return { on, active: on && alarm?.state === "armed_away" };
}

/** «På – lysene går av og på som om noen er hjemme» / «På – starter når alarmen slås på» / «Av». */
export function vacationText(v: Vacation): string {
  if (!v.on) return "Av";
  return v.active ? "På – lysene går av og på som om noen er hjemme" : "På – starter når alarmen slås på (borte)";
}
