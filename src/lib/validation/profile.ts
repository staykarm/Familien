import { z } from "zod";

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const detailSchema = z.object({
  label: z.string().trim().min(1, "Feltet trenger et navn").max(40, "Maks 40 tegn"),
  value: z.string().trim().max(500, "Maks 500 tegn"),
});

export const profileSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1, "Navn må fylles ut").max(40, "Maks 40 tegn"),
  color: z.string().regex(HEX_COLOR, "Ugyldig farge"),
  icon: z.string().trim().min(1, "Velg et ikon").max(16, "Ikonet er for langt"),
  details: z.array(detailSchema).max(30, "Maks 30 detaljer"),
});

export type ProfileInput = z.infer<typeof profileSchema>;

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function isAllowedAvatar(file: { type: string; size: number }): string | null {
  if (!(AVATAR_TYPES as readonly string[]).includes(file.type)) return "Bildet må være JPG, PNG eller WebP";
  if (file.size > AVATAR_MAX_BYTES) return "Bildet er større enn 5 MB";
  if (file.size === 0) return "Bildet er tomt";
  return null;
}

/** Leser `details` fra databasen trygt – ugyldige elementer hoppes over. */
export function parseDetails(raw: unknown): z.infer<typeof detailSchema>[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((d) => {
    const parsed = detailSchema.safeParse(d);
    return parsed.success ? [parsed.data] : [];
  });
}
