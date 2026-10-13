import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret } from "./crypto";

describe("kryptering", () => {
  const k = randomBytes(32);

  it("krypterer og dekrypterer, med ny IV hver gang", () => {
    const a = encryptSecret("hemmelig økt", k);
    const b = encryptSecret("hemmelig økt", k);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, k)).toBe("hemmelig økt");
  });

  it("avviser endret innhold og feil nøkkel", () => {
    const t = encryptSecret("data", k);
    const parts = t.split(".");
    parts[3] = Buffer.from("tull").toString("base64url");
    expect(() => decryptSecret(parts.join("."), k)).toThrow();
    expect(() => decryptSecret(t, randomBytes(32))).toThrow();
  });
});
