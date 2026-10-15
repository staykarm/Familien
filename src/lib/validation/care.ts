import { z } from "zod";

const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Skriv klokkeslett som tt:mm")
  .nullable();

/** Fast ukeplan for henting, mandag–fredag. */
export const carePlanSchema = z.object({
  memberId: z.uuid({ message: "Ugyldig person" }),
  days: z
    .array(
      z.object({
        weekday: z.number().int().min(1, "Bare hverdager").max(5, "Bare hverdager"),
        pickBy: z.uuid().nullable(),
        pickTime: time,
      })
    )
    .max(5),
});

/** Henting én dato. `reset` = følg ukeplanen igjen. Ellers overstyrer den (begge tomme = ingen henting). */
export const careDaySchema = z.object({
  memberId: z.uuid({ message: "Ugyldig person" }),
  date: z.iso.date({ message: "Ugyldig dato" }),
  reset: z.boolean(),
  pickBy: z.uuid().nullable(),
  pickTime: time,
});

export type CarePlanInput = z.input<typeof carePlanSchema>;
export type CareDayInput = z.input<typeof careDaySchema>;
