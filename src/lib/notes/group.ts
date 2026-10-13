import { DateTime } from "luxon";
import { TIME_ZONE } from "@/lib/time";
import type { NoteSummary } from "./types";

export interface NoteGroup {
  key: string;
  title: string;
  notes: NoteSummary[];
}

/** Grupperer som iOS Notater: Festet, I dag, I går, Forrige 7 dager, Forrige 30 dager, deretter per måned. */
export function groupNotes(notes: NoteSummary[], now: Date = new Date()): NoteGroup[] {
  const today = DateTime.fromJSDate(now).setZone(TIME_ZONE).startOf("day");
  const groups = new Map<string, NoteGroup>();
  const add = (key: string, title: string, n: NoteSummary) => {
    if (!groups.has(key)) groups.set(key, { key, title, notes: [] });
    groups.get(key)!.notes.push(n);
  };
  const sorted = [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  for (const n of sorted) {
    if (n.pinned) {
      add("pinned", "📌 Festet", n);
      continue;
    }
    const d = DateTime.fromISO(n.updatedAt).setZone(TIME_ZONE).startOf("day");
    const days = Math.round(today.diff(d, "days").days);
    if (days <= 0) add("today", "I dag", n);
    else if (days === 1) add("yesterday", "I går", n);
    else if (days <= 7) add("week", "Forrige 7 dager", n);
    else if (days <= 30) add("month", "Forrige 30 dager", n);
    else {
      const key = d.toFormat("yyyy-MM");
      const title = d.setLocale("nb").toFormat(d.year === today.year ? "LLLL" : "LLLL yyyy");
      add(key, title.charAt(0).toUpperCase() + title.slice(1), n);
    }
  }
  // Festet skal alltid stå øverst, uansett når notatene sist ble endret.
  return [...groups.values()].sort((a, b) => Number(b.key === "pinned") - Number(a.key === "pinned"));
}

/** Kort tidsangivelse i listen: klokkeslett i dag, ukedag denne uken, ellers dato. */
export function noteTimeLabel(iso: string, now: Date = new Date()): string {
  const t = DateTime.fromISO(iso).setZone(TIME_ZONE).setLocale("nb");
  const today = DateTime.fromJSDate(now).setZone(TIME_ZONE).startOf("day");
  const days = Math.round(today.diff(t.startOf("day"), "days").days);
  if (days <= 0) return t.toFormat("HH:mm");
  if (days === 1) return "i går";
  if (days < 7) return t.toFormat("cccc");
  return t.toFormat(t.year === today.year ? "d. LLL" : "d.M.yyyy");
}
