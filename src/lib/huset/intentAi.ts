import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { classifyVoiceText } from "./intent";

/** Samme raske modell som «Spør huset». */
const DEFAULT_MODEL = "claude-haiku-5-5";

const SYSTEM = `Du sorterer korte beskjeder fra en norsk familie, sagt inn med tale.
«house» = beskjeden ber om å styre noe i huset nå: lys, musikk, volum, varme, persienner, støvsuger eller gressklipper.
«family» = alt annet: avtaler og aktiviteter i kalenderen, oppgaver og påminnelser, eller varer til handlelisten.
En påminnelse om å gjøre noe i huset senere («husk å skru av lyset i kveld») er «family».`;

/**
 * Hvor en beskjed fra «Si det» skal: «house» (Spør huset) eller «family» (Les inn fil).
 * Ordlisten avgjør de tydelige tilfellene; ellers spør vi Claude. Uten nøkkel eller ved feil: «family», som før.
 */
export async function voiceTarget(text: string): Promise<"house" | "family"> {
  const guess = classifyVoiceText(text);
  if (guess !== "unsure") return guess;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return "family";
  try {
    const client = new Anthropic({ apiKey });
    const response = await client.beta.messages.parse({
      model: process.env.ANTHROPIC_HOUSE_MODEL || DEFAULT_MODEL,
      max_tokens: 1000,
      output_config: { effort: "low", format: betaZodOutputFormat(z.object({ target: z.enum(["house", "family"]) })) },
      system: SYSTEM,
      messages: [{ role: "user", content: text }],
    });
    return response.stop_reason === "end_turn" && response.parsed_output ? response.parsed_output.target : "family";
  } catch (err) {
    console.warn("Kunne ikke sortere beskjeden", err instanceof Anthropic.APIError ? `${err.status} ${err.message}` : err);
    return "family";
  }
}
