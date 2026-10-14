import { z } from "zod";
import { DateTime } from "luxon";
import { allDayRangeToUtc, osloDate, osloLocalToUtc } from "@/lib/calendar/dates";
import { MAX_SPAN_DAYS, occurrenceDates, occurrenceRange, type LocalTiming } from "@/lib/calendar/recurrence";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_MINUTES = 14 * 24 * 60;

const optionalText = (max: number, msg: string) =>
  z
    .string()
    .trim()
    .max(max, msg)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

/** Gjentakelse slik dialogen sender den. */
export const recurrenceSchema = z.object({
  freq: z.enum(["daily", "weekly", "monthly"]),
  interval: z.number().int().min(1).max(4),
  weekdays: z.array(z.number().int().min(1).max(7)).max(7),
  until: z.string().regex(DATE, "Velg hvor lenge den skal gjentas"),
});

/** Skjemaet slik dialogen sender det: Oslo-tid som dato + klokkeslett + varighet. */
export const eventFormSchema = z
  .object({
    id: z.uuid().nullable().optional(),
    title: z.string().trim().min(1, "Aktiviteten trenger en tittel").max(200, "Tittelen er for lang"),
    participantIds: z.array(z.uuid()).min(1, "Velg hvem som skal være med"),
    categoryId: z.uuid().nullable(),
    allDay: z.boolean(),
    date: z.string().regex(DATE, "Velg en dato"),
    startTime: z.string().regex(TIME, "Velg et klokkeslett"),
    durationMinutes: z.number().int().min(5, "Varigheten må være minst 5 minutter").max(MAX_MINUTES, "Maks 14 dager"),
    endDate: z.string().regex(DATE, "Velg en sluttdato"),
    location: optionalText(200, "Stedet er for langt"),
    notes: optionalText(2000, "Notatet er for langt"),
    recurrence: recurrenceSchema.nullable().optional(),
    /** For aktiviteter i en serie: endre bare denne, eller denne og alle senere. */
    scope: z.enum(["one", "following"]).optional(),
  })
  .transform((v, ctx) => {
    let start: string | null;
    let end: string | null;
    if (v.allDay) {
      const range = allDayRangeToUtc(v.date, v.endDate);
      if (!range) {
        ctx.addIssue({ code: "custom", message: "Sluttdatoen kan ikke være før startdatoen", path: ["endDate"] });
        return z.NEVER;
      }
      ({ start, end } = range);
    } else {
      start = osloLocalToUtc(`${v.date}T${v.startTime}`);
      end = start ? DateTime.fromISO(start).plus({ minutes: v.durationMinutes }).toUTC().toISO() : null;
    }
    if (!start || !end) {
      ctx.addIssue({ code: "custom", message: "Ugyldig dato eller klokkeslett", path: ["date"] });
      return z.NEVER;
    }
    const timing: LocalTiming = {
      allDay: v.allDay,
      startTime: v.startTime,
      durationMinutes: v.durationMinutes,
      allDayDays: Math.round(osloDate(v.endDate).diff(osloDate(v.date), "days").days) + 1,
    };
    const recurrence = v.recurrence ? { ...v.recurrence, weekdays: [...new Set(v.recurrence.weekdays)].sort() } : null;
    let occurrences: { start: string; end: string }[] | null = null;
    if (recurrence) {
      const span = osloDate(recurrence.until).diff(osloDate(v.date), "days").days;
      if (span > MAX_SPAN_DAYS) {
        ctx.addIssue({ code: "custom", message: "En gjentakelse kan vare i maks to år", path: ["recurrence"] });
        return z.NEVER;
      }
      occurrences = occurrenceDates(v.date, recurrence)
        .map((d) => occurrenceRange(d, timing))
        .filter((r): r is { start: string; end: string } => r !== null);
      if (occurrences.length === 0) {
        ctx.addIssue({ code: "custom", message: "Gjentakelsen gir ingen datoer – sjekk sluttdatoen og ukedagene", path: ["recurrence"] });
        return z.NEVER;
      }
    }
    return {
      id: v.id ?? null,
      title: v.title,
      participantIds: [...new Set(v.participantIds)],
      categoryId: v.categoryId,
      allDay: v.allDay,
      start,
      end,
      location: v.location,
      notes: v.notes,
      date: v.date,
      timing,
      recurrence,
      occurrences,
      scope: v.scope ?? "one",
    };
  });

export type EventFormInput = z.input<typeof eventFormSchema>;
export type EventToSave = z.output<typeof eventFormSchema>;

/** Flytting med dra-og-slipp. */
export const moveEventSchema = z
  .object({
    id: z.uuid(),
    start: z.iso.datetime({ offset: true }),
    end: z.iso.datetime({ offset: true }),
    allDay: z.boolean(),
  })
  .refine((v) => new Date(v.end) >= new Date(v.start), { message: "Slutt før start", path: ["end"] });

export const rangeSchema = z.object({
  start: z.iso.datetime({ offset: true }),
  end: z.iso.datetime({ offset: true }),
});
