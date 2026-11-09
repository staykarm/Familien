// Luftfukteren (Duux Beam Smart): bare visning.
// Duux-integrasjonen i Home Assistant støtter ikke Beam Smart ennå, så den gir bare de felles sensorene:
// tilkoblet, problem, feilmelding og temperatur. Kommer det en `humidifier.<prefiks>` senere, leses av/på,
// mål og fukt derfra også. Appen styrer den ikke.
// Rene funksjoner uten nettverk, slik at de kan testes.

interface StateLike {
  entity_id: string;
  state: string;
  attributes?: Record<string, unknown>;
  last_changed?: string;
}

export interface Humidifier {
  /** Svarer (binary_sensor.<prefiks>_connected). */
  online: boolean;
  /** Den melder feil (binary_sensor.<prefiks>_problem). */
  problem: boolean;
  /** Feilmeldingen på norsk, når den melder feil. */
  error: string | null;
  /** Temperaturen målt i luftfukteren. */
  temperature: number | null;
  /** På/av, bare når Home Assistant har en humidifier-enhet for den. */
  on: boolean | null;
  /** Ønsket fukt (%), fra humidifier-enheten. */
  target: number | null;
  /** Målt fukt (%), fra humidifier-enheten. */
  humidity: number | null;
  /** Kort status: «På · mål 45 %», «Feil – sjekk vanntanken», «Svarer ikke», «OK». */
  text: string;
}

const known = (s: StateLike | undefined): s is StateLike => !!s && s.state !== "unavailable" && s.state !== "unknown";
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Feilmeldingene fra Duux på norsk. Ukjente feil skyldes oftest tom vanntank. */
export function humidifierError(message: string | null | undefined): string {
  const m = (message ?? "").trim().toLowerCase();
  if (!m || m === "unknown error" || m === "unknown") return "sjekk vanntanken";
  if (m.includes("water") || m.includes("tank")) return "tom vanntank";
  return message!.trim();
}

/** Status for luftfukteren, eller null hvis Home Assistant ikke kjenner den. */
export function toHumidifier(states: StateLike[], prefix: string): Humidifier | null {
  const byId = new Map(states.map((s) => [s.entity_id, s]));
  const connected = byId.get(`binary_sensor.${prefix}_connected`);
  const problemSensor = byId.get(`binary_sensor.${prefix}_problem`);
  const message = byId.get(`sensor.${prefix}_error_message`);
  const temp = byId.get(`sensor.${prefix}_temperatur`) ?? byId.get(`sensor.${prefix}_temperature`);
  const device = byId.get(`humidifier.${prefix}`);
  if (!connected && !problemSensor && !message && !device) return null;

  const online = connected ? connected.state === "on" : known(device);
  const problem = problemSensor?.state === "on" || (known(message) && !["ok", "none", ""].includes(message.state.trim().toLowerCase()));
  const error = problem ? humidifierError(known(message) ? message.state : null) : null;
  const on = known(device) ? device.state === "on" : null;
  const target = known(device) ? num(device.attributes?.humidity) : null;
  const humidity = known(device) ? num(device.attributes?.current_humidity) : null;

  const text = !online
    ? "Svarer ikke"
    : problem
      ? `Feil – ${error}`
      : on === null
        ? "OK"
        : on
          ? ["På", target !== null ? `mål ${Math.round(target)} %` : "", humidity !== null ? `nå ${Math.round(humidity)} %` : ""].filter(Boolean).join(" · ")
          : "Av";

  return { online, problem, error, temperature: known(temp) ? num(temp.state) : null, on, target, humidity, text };
}
