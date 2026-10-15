import { DateTime } from "luxon";
import { TIME_ZONE } from "@/lib/time";

/** «i dag kl. 17:00», «i morgen kl. 08:30», «tor. 16. okt. kl. 17:00», «fre. 17. okt.» (heldag). */
export function whenText(startIso: string, allDay: boolean, now: Date = new Date()): string {
  const start = DateTime.fromISO(startIso, { zone: TIME_ZONE }).setLocale("nb");
  const today = DateTime.fromJSDate(now).setZone(TIME_ZONE).startOf("day");
  const days = Math.round(start.startOf("day").diff(today, "days").days);
  const day = days === 0 ? "i dag" : days === 1 ? "i morgen" : start.toFormat("ccc d. LLL");
  return allDay ? day : `${day} kl. ${start.toFormat("HH:mm")}`;
}

/** Navnene som én tekst: «Olav», «Olav og Edvard», «Ingvild, Olav og Edvard». */
export function namesText(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} og ${names[names.length - 1]}`;
}
