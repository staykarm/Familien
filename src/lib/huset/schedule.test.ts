import { describe, expect, it } from "vitest";
import { osloNow, parseOsloTime, scheduleWhen } from "./schedule";

const now = new Date("2026-11-13T06:12:00Z"); // fredag kl. 07:12 i Oslo

describe("parseOsloTime", () => {
  it("leser Oslo-tid", () => {
    expect(parseOsloTime("2026-11-13T10:00", now)?.toISOString()).toBe("2026-11-13T09:00:00.000Z");
  });
  it("avviser tid som har vært, er for langt fram eller er ugyldig", () => {
    expect(parseOsloTime("2026-11-13T07:00", now)).toBeNull();
    expect(parseOsloTime("2026-11-25T10:00", now)).toBeNull();
    expect(parseOsloTime("i morgen", now)).toBeNull();
  });
  it("tar med sommertid", () => {
    const summer = new Date("2026-06-01T06:00:00Z");
    expect(parseOsloTime("2026-06-01T10:00", summer)?.toISOString()).toBe("2026-06-01T08:00:00.000Z");
  });
});

describe("scheduleWhen", () => {
  it("sier i dag, i morgen eller dagen", () => {
    expect(scheduleWhen("2026-11-13T09:00:00Z", now)).toBe("kl. 10:00");
    expect(scheduleWhen("2026-11-14T09:00:00Z", now)).toBe("i morgen kl. 10:00");
    expect(scheduleWhen("2026-11-15T09:00:00Z", now)).toMatch(/^søn\.? 15\. nov\.? kl\. 10:00$/);
  });
});

describe("osloNow", () => {
  it("gir dag, dato og klokkeslett i Oslo", () => {
    expect(osloNow(now)).toBe("fredag 13. november 2026 kl. 07:12");
  });
});
