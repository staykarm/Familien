import { z } from "zod";

/**
 * Formatet Claude skal svare i (strukturert output). Gyldige navn på personer og kategorier står i
 * feltbeskrivelsene. Vi bruker ikke enum: SDK-ens hjelper sender det ikke som en hard begrensning, og et
 * ukjent navn ville da gjort hele svaret ugyldig. Ukjente navn håndteres i stedet ved koblingen (→ Felles).
 * Felt er nullable i stedet for valgfrie – det gir et stabilt skjema.
 */
export function buildExtractionSchema(memberNames: string[], eventCategories: string[]) {
  const member = z.string().describe(`Ett av: ${memberNames.join(", ")}`);
  const category = z.string().describe(`Ett av: ${eventCategories.join(", ")}`);
  return z.object({
    summary: z.string().describe("1–2 setninger på norsk om hva dokumentet er"),
    events: z.array(
      z.object({
        title: z.string().describe("Kort tittel på norsk, uten deltakernavn"),
        date: z.string().describe("YYYY-MM-DD"),
        endDate: z.string().nullable().describe("YYYY-MM-DD for siste dag ved flerdagers heldag, ellers null"),
        startTime: z.string().nullable().describe("HH:MM 24-timers, null for heldag"),
        endTime: z.string().nullable().describe("HH:MM, null hvis ukjent eller heldag"),
        allDay: z.boolean(),
        location: z.string().nullable(),
        notes: z.string().nullable().describe("Viktige detaljer, f.eks. hva som skal være med"),
        participants: z.array(member).describe("Hvem i familien det gjelder"),
        category: category.nullable(),
      })
    ),
    tasks: z.array(
      z.object({
        title: z.string(),
        dueDate: z.string().nullable().describe("YYYY-MM-DD"),
        dueTime: z.string().nullable().describe("HH:MM"),
        assignee: member.nullable(),
        notes: z.string().nullable(),
      })
    ),
    shopping: z.array(
      z.object({
        name: z.string().describe("Varenavn på norsk, f.eks. «Gymsko»"),
        quantity: z.string().nullable(),
      })
    ),
  });
}

/** Lagret forslag (payload i tabellen suggestions). Løsere enn API-skjemaet, siden navn kan endres senere. */
export const eventSuggestionSchema = z.object({
  title: z.string(),
  date: z.string(),
  endDate: z.string().nullable(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  allDay: z.boolean(),
  location: z.string().nullable(),
  notes: z.string().nullable(),
  participants: z.array(z.string()),
  category: z.string().nullable(),
});

export const taskSuggestionSchema = z.object({
  title: z.string(),
  dueDate: z.string().nullable(),
  dueTime: z.string().nullable(),
  assignee: z.string().nullable(),
  notes: z.string().nullable(),
});

export const shoppingSuggestionSchema = z.object({
  name: z.string(),
  quantity: z.string().nullable(),
});

export type EventSuggestion = z.infer<typeof eventSuggestionSchema>;
export type TaskSuggestion = z.infer<typeof taskSuggestionSchema>;
export type ShoppingSuggestion = z.infer<typeof shoppingSuggestionSchema>;
