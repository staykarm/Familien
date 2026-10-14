import { z } from "zod";

const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Skriv klokkeslett som tt:mm")
  .nullable();

export const carePlanSchema = z.object({
  memberId: z.uuid({ message: "Ugyldig person" }),
  days: z
    .array(
      z.object({
        weekday: z.number().int().min(1, "Bare hverdager").max(5, "Bare hverdager"),
        dropBy: z.uuid().nullable(),
        dropTime: time,
        pickBy: z.uuid().nullable(),
        pickTime: time,
      })
    )
    .max(5),
});

export type CarePlanInput = z.input<typeof carePlanSchema>;
