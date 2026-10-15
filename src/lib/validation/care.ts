import { z } from "zod";

const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Skriv klokkeslett som tt:mm")
  .nullable();

const slot = z.object({ by: z.uuid().nullable(), time });

/** Fast ukeplan for levering og henting, mandag–fredag. */
export const carePlanSchema = z.object({
  memberId: z.uuid({ message: "Ugyldig person" }),
  days: z
    .array(
      z.object({
        weekday: z.number().int().min(1, "Bare hverdager").max(5, "Bare hverdager"),
        drop: slot,
        pick: slot,
      })
    )
    .max(5),
});

/** Unntak for en periode. drop/pick = null betyr «som vanlig». */
export const careOverrideSchema = z
  .object({
    id: z.uuid().nullable(),
    memberId: z.uuid({ message: "Ugyldig person" }),
    from: z.iso.date({ message: "Velg fra-dato" }),
    to: z.iso.date({ message: "Velg til-dato" }),
    note: z.string().trim().max(200, "Notatet er for langt").nullable(),
    drop: slot.nullable(),
    pick: slot.nullable(),
  })
  .refine((v) => v.to >= v.from, { message: "Til-datoen kan ikke være før fra-datoen", path: ["to"] })
  .refine((v) => v.drop !== null || v.pick !== null, { message: "Velg hva som skal endres: levering, henting eller begge" })
  .refine((v) => Date.parse(v.to) - Date.parse(v.from) <= 366 * 86_400_000, { message: "Maks ett år om gangen", path: ["to"] });

export type CarePlanInput = z.input<typeof carePlanSchema>;
export type CareOverrideInput = z.input<typeof careOverrideSchema>;
