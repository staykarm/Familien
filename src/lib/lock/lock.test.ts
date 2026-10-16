import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { randomBytes } from "node:crypto";
import { hashPin, verifyPin } from "./pin";
import { createLockToken, isOpenPath, lockoutMs, readLockToken } from "./token";

const secret = randomBytes(32).toString("base64");

describe("opplåsingskapsel", () => {
  it("godtar en ekte kapsel og gir versjonen", async () => {
    const token = await createLockToken(secret, 3, Date.now() + 60_000);
    expect(await readLockToken(secret, token)).toBe(3);
  });

  it("avviser utløpt, endret eller feil nøkkel", async () => {
    const exp = Date.now() + 60_000;
    const token = await createLockToken(secret, 1, exp);
    expect(await readLockToken(secret, token, exp + 1)).toBeNull();
    expect(await readLockToken(secret, token.replace("1.", "2."))).toBeNull();
    expect(await readLockToken(randomBytes(32).toString("base64"), token)).toBeNull();
    expect(await readLockToken(secret, undefined)).toBeNull();
    expect(await readLockToken(secret, "tull")).toBeNull();
  });
});

describe("pinkode", () => {
  it("bruker 0102 når ingen kode er lagret", () => {
    expect(verifyPin("0102", null)).toBe(true);
    expect(verifyPin("1234", null)).toBe(false);
  });

  it("sjekker lagret kode", () => {
    const stored = hashPin("4711");
    expect(verifyPin("4711", stored)).toBe(true);
    expect(verifyPin("0102", stored)).toBe(false);
  });
});

describe("lås", () => {
  it("venter først etter fem feil og øker", () => {
    expect(lockoutMs(4)).toBe(0);
    expect(lockoutMs(5)).toBe(30_000);
    expect(lockoutMs(6)).toBe(60_000);
    expect(lockoutMs(50)).toBe(15 * 60_000);
  });

  it("slipper gjennom låsesiden, API og ikoner", () => {
    expect(isOpenPath("/las")).toBe(true);
    expect(isOpenPath("/api/cron/push")).toBe(true);
    expect(isOpenPath("/icon-192")).toBe(true);
    expect(isOpenPath("/")).toBe(false);
    expect(isOpenPath("/i-dag")).toBe(false);
  });
});
