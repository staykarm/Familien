import { z } from "zod";

export const pushSubscriptionSchema = z.object({
  endpoint: z.url({ message: "Ugyldig enhet" }).max(1000).startsWith("https://", "Ugyldig enhet"),
  keys: z.object({
    p256dh: z.string().min(10).max(200),
    auth: z.string().min(10).max(100),
  }),
  memberId: z.uuid().nullable(),
  device: z.string().trim().max(100).nullable(),
});

export type PushSubscriptionInput = z.input<typeof pushSubscriptionSchema>;
