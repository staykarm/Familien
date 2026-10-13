import { z } from "zod";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const taskStatusSchema = z.enum(["todo", "doing", "done"]);

export const taskFormSchema = z
  .object({
    id: z.uuid().nullable().optional(),
    title: z.string().trim().min(1, "Oppgaven trenger en tittel").max(200, "Tittelen er for lang"),
    notes: z
      .string()
      .trim()
      .max(2000, "Notatet er for langt")
      .optional()
      .transform((v) => (v ? v : null)),
    assigneeId: z.uuid().nullable(),
    categoryId: z.uuid().nullable(),
    dueDate: z
      .string()
      .regex(DATE, "Ugyldig dato")
      .nullable()
      .or(z.literal("").transform(() => null)),
    dueTime: z
      .string()
      .regex(TIME, "Ugyldig klokkeslett")
      .nullable()
      .or(z.literal("").transform(() => null)),
    status: taskStatusSchema,
  })
  .refine((v) => !v.dueTime || v.dueDate, { message: "Velg en dato for klokkeslettet", path: ["dueDate"] })
  .transform((v) => ({ ...v, id: v.id ?? null }));

export type TaskFormInput = z.input<typeof taskFormSchema>;

export const dateRangeSchema = z.object({
  from: z.string().regex(DATE),
  to: z.string().regex(DATE),
});
