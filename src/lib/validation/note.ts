import { z } from "zod";

const MAX_BYTES = 300_000;

/** Tiptap-dokument. Strukturen inni stoler vi på editoren for, men toppnivå og størrelse sjekkes. */
export const noteDocSchema = z
  .object({ type: z.literal("doc"), content: z.array(z.unknown()).optional() })
  .passthrough()
  .refine((d) => JSON.stringify(d).length <= MAX_BYTES, { message: "Notatet er for stort" });

export const saveNoteSchema = z.object({
  id: z.uuid(),
  version: z.number().int().min(1),
  content: noteDocSchema,
});
