import { z } from "zod";

const quantity = z
  .string()
  .trim()
  .max(40, "Mengden er for lang")
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

export const itemInputSchema = z.object({
  name: z.string().trim().min(1, "Skriv hva som skal kjøpes").max(120, "Navnet er for langt"),
  quantity,
  categoryId: z.uuid().nullable().optional().transform((v) => v ?? null),
});

export const itemUpdateSchema = itemInputSchema.extend({ id: z.uuid() });

export const templateSchema = z.object({
  id: z.uuid().nullable().optional().transform((v) => v ?? null),
  name: z.string().trim().min(1, "Listen trenger et navn").max(60, "Navnet er for langt"),
  icon: z.string().trim().min(1).max(16),
  items: z.array(itemInputSchema).max(100, "Maks 100 varer"),
});

export type ItemInput = z.input<typeof itemInputSchema>;
export type TemplateInput = z.input<typeof templateSchema>;
