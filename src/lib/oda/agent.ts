import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import type { OdaClient } from "./client";
import type { OdaProduct } from "./parse";

const DEFAULT_MODEL = "claude-opus-5-5";
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);
const MAX_EXTRA_SEARCHES = 15;

export interface WantedItem {
  name: string;
  quantity: string | null;
}

export interface ProposalLine {
  item: string;
  quantityText: string | null;
  product: OdaProduct | null;
  quantity: number;
  reason: string;
  alternatives: OdaProduct[];
}

export interface OdaProposal {
  lines: ProposalLine[];
  note: string | null;
}

export class AgentError extends Error {}

const proposalSchema = z.object({
  lines: z.array(
    z.object({
      item: z.string().describe("Varen nøyaktig slik den står på handlelisten"),
      productId: z.number().int().nullable().describe("Valgt Oda-produkt-id, eller null hvis ingenting passer"),
      quantity: z.number().int().min(1).max(20).describe("Antall av produktet som skal i kurven"),
      reason: z.string().describe("Kort begrunnelse på norsk, maks 12 ord"),
      alternatives: z.array(z.number().int()).max(3).describe("Opptil 3 andre gode produkt-id-er fra søkene"),
    })
  ),
  note: z.string().nullable().describe("Valgfri kort beskjed til familien på norsk"),
});

/** Kjører med begrenset samtidighet, så vi ikke hamrer Oda med alle søk på én gang. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

function describeProduct(p: OdaProduct): string {
  return `#${p.id} ${p.name}${p.extra ? ` (${p.extra})` : ""} – ${p.price ?? "?"} kr${p.available ? "" : " – UTSOLGT"}`;
}

/**
 * Agent som finner riktige Oda-varer for handlelisten. Den får forhåndssøk for hver vare og listen over
 * hva familien pleier å kjøpe, kan søke selv, og leverer et forslag via `submit_cart_proposal`.
 * Den legger ALDRI noe i handlekurven – det skjer først når familien har godkjent forslaget.
 */
export async function proposeOdaCart(oda: OdaClient, items: WantedItem[]): Promise<OdaProposal> {
  if (items.length === 0) throw new AgentError("Det er ingen varer å finne.");

  const seen = new Map<number, OdaProduct>();
  const remember = (list: OdaProduct[]) => list.forEach((p) => seen.set(p.id, p));

  const [candidates, frequent] = await Promise.all([
    mapLimit(items, 4, async (it) => {
      try {
        const found = await oda.search(it.name, 6);
        remember(found);
        return found;
      } catch {
        return [] as OdaProduct[];
      }
    }),
    oda.frequentProducts().catch(() => []),
  ]);

  let extraSearches = 0;
  const searchTool = betaZodTool({
    name: "search_oda",
    description:
      "Søk etter varer hos Oda. Bruk når forhåndssøket ikke ga en god match, f.eks. med et mer presist eller annet ord. Returnerer opptil 8 produkter med id, navn, størrelse og pris.",
    inputSchema: z.object({ query: z.string().min(1).max(80).describe("Søkeord på norsk") }),
    run: async ({ query }) => {
      if (extraSearches >= MAX_EXTRA_SEARCHES) return "Søkegrensen er nådd. Lever forslaget med det du har.";
      extraSearches++;
      try {
        const found = await oda.search(query, 8);
        remember(found);
        return found.length ? found.map(describeProduct).join("\n") : "Ingen treff.";
      } catch (e) {
        return `Søket feilet: ${e instanceof Error ? e.message : "ukjent feil"}`;
      }
    },
  });

  let submitted: z.infer<typeof proposalSchema> | null = null;
  const submitTool = betaZodTool({
    name: "submit_cart_proposal",
    description:
      "Lever det endelige forslaget: én linje per vare på handlelisten, i samme rekkefølge. Kall dette nøyaktig én gang, til slutt.",
    inputSchema: proposalSchema,
    run: async (input) => {
      submitted = input;
      return "Forslaget er mottatt. Du er ferdig.";
    },
  });

  const frequentText = frequent.length
    ? frequent
        .slice(0, 60)
        .map((f) => `#${f.id} ${f.name} (kjøpt ${f.timesBought} ganger)`)
        .join("\n")
    : "(ingen ordrehistorikk tilgjengelig)";

  const listText = items
    .map((it, i) => {
      const c = candidates[i];
      return `${i + 1}. «${it.name}»${it.quantity ? ` – antall: ${it.quantity}` : ""}\n${
        c.length ? c.map((p) => `   ${describeProduct(p)}`).join("\n") : "   (ingen treff i forhåndssøket)"
      }`;
    })
    .join("\n");

  const client = new Anthropic({ apiKey: serverEnv("ANTHROPIC_API_KEY") });
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  try {
    const final = await client.beta.messages.toolRunner({
      model,
      max_tokens: 16000,
      max_iterations: 12,
      ...(FALLBACK_MODELS.has(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      thinking: { type: "adaptive" },
      // Å matche dagligvarer er en enkel oppgave – lav innsats holder og gir raskt svar.
      output_config: { effort: "low" },
      tools: [searchTool, submitTool],
      system: `Du hjelper en norsk familie med å gjøre handlelisten om til varer i nettbutikken Oda.

Regler:
- Finn én passende Oda-vare for hver linje på handlelisten. Ikke legg til noe som ikke står på listen.
- Foretrekk varer familien har kjøpt før (se kjøpshistorikk) når de passer – det er sannsynligvis det de vil ha.
- Ellers: velg en vanlig, rimelig standardvare i normal størrelse. Unngå utsolgte varer.
- Antall: tolk «antall» fra listen (f.eks. «2» → 2 stk; «400 g» → velg en pakke som passer og antall 1). Uten antall: 1.
- Er forhåndssøket dårlig, bruk search_oda med et bedre søkeord (f.eks. «lettmelk» i stedet for «melk lett»).
- Finner du ikke noe som passer, sett productId til null og forklar kort.
- Bruk kun produkt-id-er du har sett i søkeresultatene.
- Avslutt alltid med å kalle submit_cart_proposal én gang, med én linje per vare i samme rekkefølge.`,
      messages: [
        {
          role: "user",
          content: `Kjøpshistorikk hos Oda (mest kjøpt først):\n${frequentText}\n\nHandlelisten med forhåndssøk:\n${listText}\n\nFinn varene og lever forslaget med submit_cart_proposal.`,
        },
      ],
    });
    if (final.stop_reason === "refusal") throw new AgentError("Claude kunne ikke behandle handlelisten.");
  } catch (err) {
    if (err instanceof AgentError) throw err;
    if (err instanceof Anthropic.AuthenticationError) throw new AgentError("ANTHROPIC_API_KEY er ugyldig. Sjekk nøkkelen i Vercel.");
    if (err instanceof Anthropic.RateLimitError) throw new AgentError("Claude er opptatt akkurat nå. Prøv igjen om litt.");
    if (err instanceof Anthropic.APIError) throw new AgentError(`Feil fra Claude (${err.status}). Prøv igjen.`);
    throw err;
  }

  const result = submitted as z.infer<typeof proposalSchema> | null;
  if (!result) throw new AgentError("Fikk ikke et ferdig forslag. Prøv igjen.");

  // Knytt svaret til produktene vi faktisk har sett (aldri stol på id-er som ikke kom fra Oda).
  return {
    note: result.note,
    lines: items.map((it, i) => {
      const line = result.lines.find((l) => l.item.trim().toLowerCase() === it.name.trim().toLowerCase()) ?? result.lines[i];
      const product = line?.productId != null ? (seen.get(line.productId) ?? null) : null;
      return {
        item: it.name,
        quantityText: it.quantity,
        product,
        quantity: line?.quantity ?? 1,
        reason: line?.reason ?? "",
        alternatives: [
          ...(line?.alternatives ?? []).map((id) => seen.get(id)).filter((p): p is OdaProduct => !!p),
          ...candidates[i],
        ]
          .filter((p, idx, arr) => p.id !== product?.id && arr.findIndex((x) => x.id === p.id) === idx)
          .slice(0, 5),
      };
    }),
  };
}
