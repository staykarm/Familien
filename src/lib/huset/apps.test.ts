import { describe, expect, it } from "vitest";
import { appLink, VENDOR_APPS } from "./apps";

describe("produsentenes apper", () => {
  it("lenker til appen i App Store", () => {
    expect(appLink("roborock")).toBe("https://apps.apple.com/no/app/id1462875428");
    for (const app of Object.values(VENDOR_APPS)) expect(app.appStoreId).toMatch(/^\d{9,10}$/);
  });
});
