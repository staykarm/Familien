import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// «Kryptering» som er lett å lese i testene.
vi.mock("@/lib/crypto", () => ({ encryptSecret: (s: string) => `enc:${s}`, decryptSecret: (s: string) => s.replace(/^enc:/, "") }));

let row: Record<string, unknown> | null = null;
const upserts: Record<string, unknown>[] = [];
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }),
      upsert: async (r: Record<string, unknown>) => {
        upserts.push(r);
        row = { ...row, ...r };
      },
    }),
  }),
}));

const state = { loggedIn: true, logins: [] as string[], wrongPassword: false };
vi.mock("./client", () => {
  class OdaError extends Error {
    constructor(
      message: string,
      readonly kind = "unexpected"
    ) {
      super(message);
    }
  }
  class OdaClient {
    constructor(public jar: Record<string, string> = {}) {}
    async isLoggedIn() {
      return this.jar.sessionid === "fersk" || state.loggedIn;
    }
    async login(email: string, password: string) {
      if (state.wrongPassword) throw new OdaError("Feil e-post eller passord hos Oda.", "auth");
      state.logins.push(`${email}/${password}`);
      this.jar = { sessionid: "fersk" };
    }
  }
  return { OdaClient, OdaError };
});

const { withOda } = await import("./session");

beforeEach(() => {
  upserts.length = 0;
  state.loggedIn = true;
  state.logins = [];
  state.wrongPassword = false;
});

describe("withOda", () => {
  it("bruker den lagrede økten når den fortsatt er innlogget", async () => {
    row = { email: "m@x.no", cookies_encrypted: 'enc:{"sessionid":"gammel"}', password_encrypted: "enc:hemmelig" };
    const jar = await withOda(async (c) => c.jar);
    expect(jar).toEqual({ sessionid: "gammel" });
    expect(state.logins).toEqual([]);
  });

  it("logger inn på nytt av seg selv når økten er utløpt og passordet er husket", async () => {
    state.loggedIn = false;
    row = { email: "m@x.no", cookies_encrypted: 'enc:{"sessionid":"gammel"}', password_encrypted: "enc:hemmelig" };
    const jar = await withOda(async (c) => c.jar);
    expect(jar).toEqual({ sessionid: "fersk" });
    expect(state.logins).toEqual(["m@x.no/hemmelig"]);
    expect(upserts.at(-1)?.cookies_encrypted).toBe('enc:{"sessionid":"fersk"}');
  });

  it("ber om ny tilkobling når økten er utløpt og passordet ikke er husket", async () => {
    state.loggedIn = false;
    row = { email: "m@x.no", cookies_encrypted: 'enc:{"sessionid":"gammel"}', password_encrypted: null };
    await expect(withOda(async () => "ok")).rejects.toMatchObject({ kind: "auth" });
  });

  it("glemmer passordet hvis Oda ikke godtar det lenger", async () => {
    state.loggedIn = false;
    state.wrongPassword = true;
    row = { email: "m@x.no", cookies_encrypted: 'enc:{"sessionid":"gammel"}', password_encrypted: "enc:gammelt" };
    await expect(withOda(async () => "ok")).rejects.toMatchObject({ kind: "auth" });
    await vi.waitFor(() => expect(upserts.at(-1)?.password_encrypted).toBeNull());
  });

  it("gir tydelig feil når Oda ikke er koblet til", async () => {
    row = null;
    await expect(withOda(async () => "ok")).rejects.toThrow(/ikke koblet til/);
  });
});
