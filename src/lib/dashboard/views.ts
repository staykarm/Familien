// Undersidene på dashboardet (`/dashboard?vis=<id>`). Egen fil uten «use client», så serveren kan lese den.

export const VIEW_TITLES = {
  dag: "Uka",
  vaer: "Været",
  oppgaver: "Oppgaver",
  handleliste: "Handleliste",
  kart: "Kart",
  lys: "Lys",
  varme: "Varme",
  persienner: "Persienner",
  roboter: "Roboter",
  vanning: "Vanning",
  musikk: "Musikk",
  maskiner: "Maskiner",
  strom: "Strøm",
  sikkerhet: "Sikkerhet",
} as const;

export type DashboardViewId = keyof typeof VIEW_TITLES;

export const isDashboardView = (v: unknown): v is DashboardViewId => typeof v === "string" && Object.hasOwn(VIEW_TITLES, v);
