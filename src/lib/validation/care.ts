import { z } from "zod";

const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Skriv klokkeslett som tt:mm")
  .nullable();

const slot = z.object({ by: z.uuid().nullable(), time });

/** Levering og henting for ett barn én dag. Tom dag fjernes. */
export const careEntrySchema = z.object({
  memberId: z.uuid({ message: "Ugyldig person" }),
  date: z.iso.date({ message: "Ugyldig dato" }),
  drop: slot,
  pick: slot,
});

export type CareEntryInput = z.input<typeof careEntrySchema>;
