import { describe, expect, it } from "vitest";
import { applySetCookies, cookieHeader, countPurchases, parseLoggedInEmail, parseSearchHtml } from "./parse";

/** Lager en side slik Oda leverer den: React Query-tilstand delt over flere __next_f-biter. */
function fakeSearchPage(items: unknown[]): string {
  const row = `48:["$","$L30",null,{"state":{"mutations":[],"queries":[{"queryKey":[{"_id":"user"}],"state":{"data":{"email":"x"}}},{"queryKey":[{"_id":"mixedSearch","query":{"q":"melk"}}],"state":{"data":{"type":"product","items":${JSON.stringify(items)}}}}]}}]\n`;
  const mid = Math.floor(row.length / 2);
  const chunks = [row.slice(0, mid), row.slice(mid)];
  return `<html><body><script>(self.__next_f=self.__next_f||[]).push([0])</script>${chunks
    .map((c) => `<script>self.__next_f.push(${JSON.stringify([1, c])})</script>`)
    .join("")}</body></html>`;
}

describe("parseSearchHtml", () => {
  it("leser produkter fra den oppdelte Next.js-strømmen", () => {
    const html = fakeSearchPage([
      {
        id: 132,
        type: "product",
        attributes: {
          id: 132,
          fullName: "Tine Lettmelk 1% fett",
          nameExtra: "1 l",
          brand: "TINE",
          grossPrice: "24.90",
          grossUnitPrice: "24.90",
          unitPriceQuantityAbbreviation: "l",
          availability: { isAvailable: true },
          images: [{ thumbnail: { url: "https://img/1.jpg" } }],
        },
      },
      { id: 9, type: "recipe", attributes: { id: 9, title: "Grøt" } },
      { id: 133, type: "product", attributes: { id: 133, name: "Melk", availability: { isAvailable: false } } },
    ]);
    const products = parseSearchHtml(html);
    expect(products).toHaveLength(2);
    expect(products[0]).toEqual({
      id: 132,
      name: "Tine Lettmelk 1% fett",
      extra: "1 l",
      brand: "TINE",
      price: 24.9,
      unitPrice: "24.90 kr/l",
      available: true,
      imageUrl: "https://img/1.jpg",
    });
    expect(products[1].available).toBe(false);
  });

  it("tom side gir ingen produkter", () => {
    expect(parseSearchHtml("<html></html>")).toEqual([]);
  });
});

describe("parseLoggedInEmail", () => {
  /** Side med bare «user»-spørringen, slik Oda har den i toppen av hver side. */
  const page = (user: unknown) => {
    const row = `1:["$","$L2",null,{"state":{"queries":[{"queryKey":["user"],"state":{"data":${JSON.stringify(user)}}}]}}]\n`;
    return `<script>self.__next_f.push(${JSON.stringify([1, row])})</script>`;
  };

  it("finner e-posten når noen er innlogget", () => {
    expect(parseLoggedInEmail(page({ email: "marius@example.com", firstName: "Marius" }))).toBe("marius@example.com");
  });

  it("gir null for gjest", () => {
    expect(parseLoggedInEmail(page(null))).toBeNull();
  });

  it("gir undefined når siden ikke har dataene (ukjent)", () => {
    expect(parseLoggedInEmail("<html></html>")).toBeUndefined();
  });
});

describe("countPurchases", () => {
  it("teller hver ordre én gang per produkt og sorterer etter antall", () => {
    const res = countPurchases([
      { items: { item_groups: [{ items: [{ product_id: 1, description: "Melk" }, { product_id: 2, description: "Brød" }] }, { items: [{ product_id: 1 }] }] } },
      { items: { item_groups: [{ items: [{ product_id: 1, description: "Melk" }] }] } },
    ]);
    expect(res).toEqual([
      { id: 1, name: "Melk", timesBought: 2 },
      { id: 2, name: "Brød", timesBought: 1 },
    ]);
  });
});

describe("cookies", () => {
  it("legger til, oppdaterer og fjerner utløpte", () => {
    let jar = applySetCookies({}, ["csrftoken=abc; Path=/; Secure", "sessionid=s1; HttpOnly"]);
    jar = applySetCookies(jar, ["sessionid=s2; Path=/", "csrftoken=; Max-Age=0"]);
    expect(jar).toEqual({ sessionid: "s2" });
    expect(cookieHeader({ a: "1", b: "2" })).toBe("a=1; b=2");
  });
});
