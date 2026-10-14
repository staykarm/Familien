import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { DateTime } from "luxon";
import mammoth from "mammoth";
import { serverEnv } from "@/lib/env";
import { TIME_ZONE } from "@/lib/time";
import { buildExtractionSchema } from "./schema";

const DEFAULT_MODEL = "claude-opus-5-5";
/** Modeller som støtter server-side fallback ved avvisning (refusal). */
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);

export const PDF_TYPES = ["application/pdf"];
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
export const WORD_TYPES = ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
export const TEXT_TYPES = ["text/plain"];
export const ALLOWED_UPLOAD_TYPES = [...PDF_TYPES, ...IMAGE_TYPES, ...WORD_TYPES, ...TEXT_TYPES];
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export interface FamilyContext {
  members: { name: string; isShared: boolean; details: { label: string; value: string }[] }[];
  eventCategories: string[];
  /** Valgt av brukeren: alt i filen gjelder disse. */
  appliesTo?: string[];
}

function systemPrompt(ctx: FamilyContext, now: Date): string {
  const today = DateTime.fromJSDate(now).setZone(TIME_ZONE).setLocale("nb");
  const people = ctx.members
    .filter((m) => !m.isShared)
    .map((m) => {
      const info = m.details.filter((d) => d.value.trim()).map((d) => `${d.label}: ${d.value}`);
      return `- ${m.name}${info.length ? ` (${info.join("; ")})` : ""}`;
    })
    .join("\n");

  return `Du hjelper en norsk familie med å planlegge. Du får et dokument (ukeplan fra skole/barnehage, invitasjon, informasjonsskriv o.l.) og skal finne konkrete aktiviteter, oppgaver og ting som må kjøpes.

I dag er ${today.toFormat("cccc d. LLLL yyyy")} (uke ${today.weekNumber}). Tidssone: Europe/Oslo.

Familien:
${people}
- Felles (hele familien)

Slik vurderer du innholdet:
- Aktiviteter (events) er ting som skjer på et tidspunkt: turdager, foreldremøter, bursdager, kamper, fridager. Bruk klokkeslett når det står; ellers heldag.
- Oppgaver (tasks) er ting noen må huske eller gjøre: ta med gymtøy, levere svarslipp, betale for tur. Sett frist til dagen det gjelder (eller svarfristen).
- Handleliste (shopping) er bare ting som faktisk må kjøpes, f.eks. «ta med nye innesko» eller «kjøp gave».
- Finn ut hvem det gjelder ut fra skole, klasse, barnehage og aktiviteter i familielisten. Er du usikker, bruk «Felles». En invitasjon til et barn gjelder det barnet.
- Relative datoer («mandag», «neste uke») regnes ut fra ukenummer/dato i dokumentet, ellers fra dagens dato. Datoer skal være YYYY-MM-DD.
- Faste ukentlige ting i en ukeplan legges inn for hver dag de gjelder i perioden planen dekker (maks 6 uker).
- Ta ikke med ting som allerede har skjedd, og ikke dikt opp noe som ikke står i dokumentet. Hopp heller over noe enn å gjette dato.
- Unngå duplikater: samme ting skal ikke være både aktivitet og oppgave. Generelle beskjeder uten handling tas ikke med.
- Skriv titler korte og vennlige på norsk, uten personnavn i tittelen (deltakere settes i eget felt).
- Kategori velges fra listen hvis en passer.${
    ctx.appliesTo?.length
      ? `\n\nBrukeren har sagt at alt i dokumentet gjelder ${ctx.appliesTo.join(" og ")}. Bruk det som deltakere og ansvarlig, og ta bare med det som gjelder ${ctx.appliesTo.length > 1 ? "dem" : ctx.appliesTo[0]}.`
      : ""
  }`;
}

async function fileContent(data: Buffer, mime: string, filename: string): Promise<Anthropic.Beta.BetaContentBlockParam[]> {
  if (PDF_TYPES.includes(mime)) {
    return [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: data.toString("base64") } }];
  }
  if (IMAGE_TYPES.includes(mime)) {
    return [
      {
        type: "image",
        source: { type: "base64", media_type: mime as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: data.toString("base64") },
      },
    ];
  }
  let text: string;
  if (WORD_TYPES.includes(mime)) {
    text = (await mammoth.extractRawText({ buffer: data })).value;
  } else {
    text = data.toString("utf8");
  }
  return [{ type: "text", text: `<document filename="${filename.replace(/"/g, "")}">\n${text}\n</document>` }];
}

export type Extraction = ReturnType<typeof buildExtractionSchema>["_output"];

export class ExtractionError extends Error {}

/** Sender filen til Claude og returnerer strukturerte forslag. Kaster ExtractionError med norsk melding. */
export async function extractSuggestions(
  file: { data: Buffer; mime: string; filename: string },
  ctx: FamilyContext,
  now: Date = new Date()
): Promise<Extraction> {
  const client = new Anthropic({ apiKey: serverEnv("ANTHROPIC_API_KEY") });
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const schema = buildExtractionSchema(
    ctx.members.map((m) => m.name),
    ctx.eventCategories
  );

  try {
    const response = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      // Avvises forespørselen av sikkerhetsfiltrene, prøver API-et automatisk en annen modell.
      ...(FALLBACK_MODELS.has(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: betaZodOutputFormat(schema) },
      system: systemPrompt(ctx, now),
      messages: [
        {
          role: "user",
          content: [
            ...(await fileContent(file.data, file.mime, file.filename)),
            { type: "text", text: `Filnavn: ${file.filename}. Finn aktiviteter, oppgaver og handlevarer i dokumentet over.` },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") throw new ExtractionError("Claude kunne ikke lese dette dokumentet.");
    if (response.stop_reason === "max_tokens") throw new ExtractionError("Dokumentet var for stort til å tolke på én gang.");
    if (!response.parsed_output) throw new ExtractionError("Fikk ikke et gyldig svar fra Claude. Prøv igjen.");
    return response.parsed_output;
  } catch (err) {
    if (err instanceof ExtractionError) throw err;
    if (err instanceof Anthropic.AuthenticationError) throw new ExtractionError("ANTHROPIC_API_KEY er ugyldig. Sjekk nøkkelen i Vercel.");
    if (err instanceof Anthropic.RateLimitError) throw new ExtractionError("Claude er opptatt akkurat nå. Prøv igjen om litt.");
    if (err instanceof Anthropic.BadRequestError) throw new ExtractionError(`Claude avviste filen: ${err.message}`);
    if (err instanceof Anthropic.APIError) throw new ExtractionError(`Feil fra Claude (${err.status}). Prøv igjen.`);
    throw err;
  }
}
