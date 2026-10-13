import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Etterligner Claude: kaller search_oda én gang og leverer så et forslag via submit_cart_proposal.
const runnerCalls: { tools: { name: string; run: (input: unknown) => Promise<string> }[]; system: string }[] = [];
let proposal: unknown;
vi.mock("@anthropic-ai/sdk", () => {
  class Anthropic {
    static APIError = class extends Error {};
    static AuthenticationError = class extends Error {};
    static RateLimitError = class extends Error {};
    beta = {
      messages: {
        toolRunner: async (params: { tools: { name: string; run: (input: unknown) => Promise<string> }[]; system: string }) => {
          runnerCalls.push(params);
          await params.tools.find((t) => t.name === "search_oda")!.run({ query: "lettmelk" });
          await params.tools.find((t) => t.name === "submit_cart_proposal")!.run(proposal);
          return { stop_reason: "end_turn" };
        },
      },
    };
  }
  return { default: Anthropic };
});

import { proposeOdaCart } from "./agent";
import type { OdaClient } from "./client";
import type { OdaProduct } from "./parse";

const p = (id: number, name: string): OdaProduct => ({ id, name, extra: "", brand: null, price: 20, unitPrice: null, available: true, imageUrl: null });

function fakeOda(): OdaClient {
  return {
    search: vi.fn(async (q: string) => (q === "Melk" ? [p(1, "Helmelk")] : q === "lettmelk" ? [p(2, "Lettmelk")] : q === "Brød" ? [p(3, "Grovbrød"), p(4, "Loff")] : [])),
    frequentProducts: vi.fn(async () => [{ id: 2, name: "Lettmelk", timesBought: 5 }]),
  } as unknown as OdaClient;
}

describe("proposeOdaCart", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test";
    runnerCalls.length = 0;
  });

  it("forhåndssøker, lar agenten søke, og kobler forslaget til ekte produkter", async () => {
    proposal = {
      note: null,
      lines: [
        { item: "Melk", productId: 2, quantity: 2, reason: "Kjøpt før", alternatives: [1] },
        { item: "Brød", productId: 3, quantity: 1, reason: "Standard", alternatives: [4] },
        { item: "Bursdagslys", productId: 999, quantity: 1, reason: "Oppdiktet id", alternatives: [] },
      ],
    };
    const oda = fakeOda();
    const res = await proposeOdaCart(oda, [
      { name: "Melk", quantity: "2" },
      { name: "Brød", quantity: null },
      { name: "Bursdagslys", quantity: null },
    ]);

    expect(runnerCalls[0].system).toMatch(/submit_cart_proposal/);
    expect(res.lines[0].product?.name).toBe("Lettmelk"); // funnet via agentens eget søk
    expect(res.lines[0].quantity).toBe(2);
    expect(res.lines[0].alternatives.map((a) => a.id)).toEqual([1]);
    expect(res.lines[1].product?.id).toBe(3);
    expect(res.lines[1].alternatives.map((a) => a.id)).toEqual([4]);
    // Id-er som ikke kom fra Oda godtas aldri.
    expect(res.lines[2].product).toBeNull();
  });

  it("feiler tydelig uten varer", async () => {
    await expect(proposeOdaCart(fakeOda(), [])).rejects.toThrow(/ingen varer/);
  });
});
