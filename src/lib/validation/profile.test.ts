import { describe, expect, it } from "vitest";
import { isAllowedAvatar, parseDetails, profileSchema } from "./profile";

const valid = {
  id: "8d0f3c8e-6b7a-4c51-9a8e-2f9b1a3c4d5e",
  name: "  Edvard ",
  color: "#f0a030",
  icon: "🦖",
  details: [{ label: "Skole", value: " Vardeveien skole " }],
};

describe("profileSchema", () => {
  it("godtar og trimmer gyldig profil", () => {
    const parsed = profileSchema.parse(valid);
    expect(parsed.name).toBe("Edvard");
    expect(parsed.details[0].value).toBe("Vardeveien skole");
  });

  it("avviser ugyldig farge og tomt navn", () => {
    expect(profileSchema.safeParse({ ...valid, color: "red" }).success).toBe(false);
    expect(profileSchema.safeParse({ ...valid, name: "   " }).success).toBe(false);
  });

  it("avviser detalj uten navn", () => {
    expect(profileSchema.safeParse({ ...valid, details: [{ label: "", value: "x" }] }).success).toBe(false);
  });
});

describe("parseDetails", () => {
  it("hopper over ugyldige elementer og tåler feil type", () => {
    expect(parseDetails([{ label: "Sko", value: "32" }, { foo: 1 }, "x"])).toEqual([{ label: "Sko", value: "32" }]);
    expect(parseDetails(null)).toEqual([]);
  });
});

describe("isAllowedAvatar", () => {
  it("sjekker type og størrelse", () => {
    expect(isAllowedAvatar({ type: "image/webp", size: 1000 })).toBeNull();
    expect(isAllowedAvatar({ type: "image/gif", size: 1000 })).not.toBeNull();
    expect(isAllowedAvatar({ type: "image/png", size: 6 * 1024 * 1024 })).not.toBeNull();
  });
});
