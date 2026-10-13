import { z } from "zod";
import { DateTime } from "luxon";
import { allDayRangeToUtc, osloLocalToUtc } from "@/lib/calendar/dates";

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
