export const TIME_ZONE = "Europe/Oslo";

const longDate = new Intl.DateTimeFormat("nb-NO", {
  timeZone: TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
});

/** «mandag 12. oktober» i Oslo-tid, uavhengig av serverens tidssone. */
export function formatLongDate(date: Date): string {
  return longDate.format(date);
}

/** Klokketime (0–23) i Oslo-tid. */
export function osloHour(date: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(date)
  );
}

export function greeting(date: Date): string {
  const h = osloHour(date);
  if (h < 5) return "God natt";
  if (h < 10) return "God morgen";
  if (h < 17) return "Hei";
  return "God kveld";
}
