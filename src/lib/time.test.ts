import { describe, expect, it } from "vitest";
import { formatLongDate, greeting, osloHour } from "./time";

describe("Oslo-tid", () => {
  it("bruker sommertid (UTC+2) og vintertid (UTC+1)", () => {
    expect(osloHour(new Date("2026-07-01T10:00:00Z"))).toBe(12);
    expect(osloHour(new Date("2026-12-01T10:00:00Z"))).toBe(11);
  });

  it("dagen skifter ved midnatt Oslo-tid, ikke UTC", () => {
    expect(formatLongDate(new Date("2026-10-11T22:30:00Z"))).toBe("mandag 12. oktober");
  });

  it("hilser etter tid på døgnet", () => {
    expect(greeting(new Date("2026-10-12T05:00:00Z"))).toBe("God morgen");
    expect(greeting(new Date("2026-10-12T18:00:00Z"))).toBe("God kveld");
  });
});
