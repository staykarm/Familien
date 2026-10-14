import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Autosaver } from "./autosave";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("Autosaver", () => {
  it("lagrer først etter en pause, og bare siste versjon", async () => {
    const save = vi.fn(async () => true);
    const a = new Autosaver({ title: "" }, save, { delay: 500 });
    a.update({ title: "M" });
    a.update({ title: "Me" });
    a.update({ title: "Melk" });
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ title: "Melk" });
  });

  it("lagrer ikke når innholdet er uendret", async () => {
    const save = vi.fn(async () => true);
    const a = new Autosaver({ title: "Melk" }, save);
    a.update({ title: "Melk" });
    await a.flush();
    expect(save).not.toHaveBeenCalled();
  });

  it("kjører lagringer etter hverandre, så en ny oppgave ikke opprettes to ganger", async () => {
    let running = 0;
    let maxParallel = 0;
    const save = vi.fn(async () => {
      running++;
      maxParallel = Math.max(maxParallel, running);
      await new Promise((r) => setTimeout(r, 100));
      running--;
      return true;
    });
    const a = new Autosaver({ title: "" }, save, { delay: 10 });
    a.update({ title: "A" });
    const first = a.flush();
    await vi.advanceTimersByTimeAsync(50); // første lagring pågår
    a.update({ title: "AB" });
    const second = a.flush();
    await vi.advanceTimersByTimeAsync(300);
    await Promise.all([first, second]);
    expect(maxParallel).toBe(1);
    expect(save.mock.calls.map((c) => (c as unknown as [{ title: string }])[0].title)).toEqual(["A", "AB"]);
  });

  it("feil gir status «error», og samme innhold prøves igjen neste gang", async () => {
    const states: string[] = [];
    const save = vi.fn(async () => false);
    const a = new Autosaver({ title: "" }, save, { onState: (s) => states.push(s) });
    a.update({ title: "X" });
    expect(await a.flush()).toBe(false);
    expect(a.dirty).toBe(true);
    expect(states).toEqual(["saving", "error"]);
  });

  it("prøver igjen av seg selv etter en feil, også når lagringen kaster", async () => {
    let calls = 0;
    const save = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new Error("nettbrudd");
      return true;
    });
    const states: string[] = [];
    const a = new Autosaver({ title: "" }, save, { retryDelay: 1000, onState: (s) => states.push(s) });
    a.update({ title: "X" });
    expect(await a.flush()).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(a.dirty).toBe(false);
    expect(states).toEqual(["saving", "error", "saving", "saved"]);
    a.dispose();
  });

  it("key lar felt som id endre seg uten ny lagring", async () => {
    const save = vi.fn(async () => true);
    const a = new Autosaver({ id: null as string | null, title: "" }, save, { key: (v) => v.title });
    a.update({ id: null, title: "Ny" });
    await a.flush();
    a.update({ id: "123", title: "Ny" });
    await a.flush();
    expect(save).toHaveBeenCalledTimes(1);
  });
});
