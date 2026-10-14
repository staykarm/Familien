import { beforeEach, describe, expect, it, vi } from "vitest";

const uploaded: { path: string; type: string }[] = [];
const rows: Record<string, unknown>[] = [];
const fakeDb = {
  storage: {
    from: () => ({
      upload: async (path: string, _body: Blob, opts: { contentType: string }) => {
        uploaded.push({ path, type: opts.contentType });
        return { error: null };
      },
    }),
  },
  from: () => ({
    insert: (row: Record<string, unknown>) => ({
      select: () => ({
        maybeSingle: async () => {
          rows.push(row);
          return { data: { id: `00000000-0000-4000-8000-00000000000${rows.length}` } };
        },
      }),
    }),
  }),
};

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/extract", () => ({
  ALLOWED_UPLOAD_TYPES: ["image/png", "image/jpeg", "application/pdf", "text/plain"],
  MAX_UPLOAD_BYTES: 20 * 1024 * 1024,
}));
vi.mock("@/lib/session", () => ({ requireFamily: async () => ({ activeMember: { id: "m1" } }) }));
vi.mock("@/lib/supabase/db", () => ({ getDb: async () => fakeDb }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeDb }));

const { POST } = await import("./route");

const post = (form: FormData, headers: Record<string, string> = {}) =>
  POST(new Request("https://familien.test/api/del", { method: "POST", body: form, headers }));

beforeEach(() => {
  uploaded.length = 0;
  rows.length = 0;
});

describe("del til appen", () => {
  it("lagrer delte bilder og sender videre til «Les inn fil» for tolkning", async () => {
    const form = new FormData();
    form.append("filer", new File(["x"], "Skjermbilde.png", { type: "image/png" }));
    const res = await post(form);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/^https:\/\/familien\.test\/filer\?tolk=[0-9a-f-]{36}$/);
    expect(uploaded[0].type).toBe("image/png");
    expect(rows[0]).toMatchObject({ filename: "Skjermbilde.png", uploaded_by: "m1" });
  });

  it("delt tekst uten fil blir en tekstfil", async () => {
    const form = new FormData();
    form.append("text", "Foreldremøte tirsdag kl. 18 i aulaen");
    await post(form);
    expect(uploaded[0].type).toBe("text/plain");
    expect(rows[0]).toMatchObject({ filename: "Delt tekst.txt" });
  });

  it("filtyper som ikke støttes gir en forklaring, og snarveier kan be om JSON", async () => {
    const form = new FormData();
    form.append("filer", new File(["x"], "video.mov", { type: "video/quicktime" }));
    const res = await post(form, { accept: "application/json" });
    const body = (await res.json()) as { ok: boolean; message: string };
    expect(body.ok).toBe(false);
    expect(body.message).toMatch(/kunne ikke leses/);
    expect(uploaded).toHaveLength(0);
  });

  it("gjetter filtype når telefonen ikke sender den", async () => {
    const form = new FormData();
    form.append("filer", new File(["x"], "brev.pdf", { type: "" }));
    await post(form);
    expect(uploaded[0].type).toBe("application/pdf");
  });
});
