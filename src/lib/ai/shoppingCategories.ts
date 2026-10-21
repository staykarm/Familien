import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

/** Rask og billig modell holder for å plassere varenavn i en avdeling. Kan overstyres med ANTHROPIC_SHOPPING_MODEL. */
const DEFAULT_MODEL = "claude-haiku-5-5";

/**
 * Spør Claude hvilken butikkavdeling hver vare hører til. Svaret er alltid en av `categories`.
 * `examples` er det familien selv har valgt før («Grandiosa» → «Frys»), så Claude følger husets vaner.
 * Gir et kart fra varenavn (slik det ble sendt) til avdeling. Uten nøkkel eller ved feil: tomt kart.
 */
export async function classifyShoppingItems(
  names: string[],
  categories: string[],
  examples: { name: string; category: string }[] = [],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!names.length || categories.length === 0 || !apiKey) return result;

  const schema = z.object({
    items: z.array(z.object({ name: z.string(), category: z.enum(categories as [string, ...string[]]) })),
  });
  const client = new Anthropic({ apiKey });
  try {
    const response = await client.beta.messages.parse({
      model: process.env.ANTHROPIC_SHOPPING_MODEL || DEFAULT_MODEL,
      max_tokens: 4000,
      output_config: { effort: "low", format: betaZodOutputFormat(schema) },
      system: systemPrompt(categories, examples),
      messages: [{ role: "user", content: `Varer:\n${names.map((n) => `- ${n}`).join("\n")}` }],
    });
    if (response.stop_reason !== "end_turn" || !response.parsed_output) return result;
    for (const item of response.parsed_output.items) {
      // Godta bare navn vi faktisk sendte (Claude kan rette skrivemåten).
      const match = names.find((n) => n === item.name) ?? names.find((n) => n.toLocaleLowerCase("nb") === item.name.toLocaleLowerCase("nb"));
      if (match) result.set(match, item.category);
    }
  } catch (err) {
    // Kategoriseringen er bare til hjelp: feil her skal aldri stoppe handlelisten.
    console.warn("Kunne ikke kategorisere varer med Claude", err instanceof Anthropic.APIError ? `${err.status} ${err.message}` : err);
  }
  return result;
}

function systemPrompt(categories: string[], examples: { name: string; category: string }[]): string {
  const lines = [
    "Du sorterer en norsk familie sin handleliste etter avdelingene i en vanlig norsk dagligvarebutikk (Rema, Kiwi, Meny, Coop).",
    `Avdelingene er: ${categories.map((c) => `«${c}»`).join(", ")}.`,
    "Velg den avdelingen der varen vanligvis står i butikken. Merkenavn skal tolkes (f.eks. Grandiosa er frossenpizza, Jarlsberg er ost, Zalo er oppvaskmiddel).",
    "Varer som ligger i frysedisken, hører til frys, selv om de er grønnsaker eller fisk.",
    "Bruk «Annet» bare når ingen avdeling passer (f.eks. gaver, apotekvarer eller ting som ikke selges i dagligvarebutikk).",
    "Gi tilbake hver vare med nøyaktig samme navn som i listen.",
  ];
  if (examples.length) {
    lines.push("Slik har familien selv plassert varer før. Følg samme vaner:");
    for (const e of examples) lines.push(`- ${e.name} → ${e.category}`);
  }
  return lines.join("\n");
}
