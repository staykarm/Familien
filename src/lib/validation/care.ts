import { z } from "zod";

const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Skriv klokkeslett som tt:mm")
  .nullable();

const slot = z.object({
  by: z.uuid().nullable(),
  /** Fritekst for noen utenfor appen, f.eks. «Farmor». */
  other: z.string().trim().max(40, "Navnet er for langt").nullable(),
  time,
});

/** Levering og henting for ett barn én dag. Tom dag fjernes. */
export const careEntrySchema = z.object({
  memberId: z.uuid({ message: "Ugyldig person" }),
  date: z.iso.date({ message: "Ugyldig dato" }),
  drop: slot,
  pick: slot,
});

export type CareEntryInput = z.input<typeof careEntrySchema>;

/** Hvem som kan velges som leverer/henter (medlems-id-er). */
export const carePickersSchema = z.array(z.uuid()).max(20);
