import "server-only";
import { applySetCookies, cookieHeader, countPurchases, parseSearchHtml, type OdaProduct } from "./parse";

const BASE = "https://oda.com";
// Oda svarer ofte uten data til «nakne» klienter, så vi oppgir en vanlig nettleser.
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  "Accept-Language": "nb-NO,nb;q=0.9,no;q=0.8",
};

export class OdaError extends Error {
  constructor(
    message: string,
    readonly kind: "auth" | "network" | "unexpected" = "unexpected"
  ) {
    super(message);
  }
}

export interface CartSummary {
  itemCount: number;
  total: string | null;
}

/**
 * Minimal klient mot Oda (oda.com/no). Oda har ikke et offisielt API; dette er de samme kallene
 * nettsiden selv gjør. Økten (cookies) holdes i `jar` og lagres kryptert av kalleren.
 */
export class OdaClient {
  constructor(public jar: Record<string, string> = {}) {}

  private async request(path: string, init: { method?: string; body?: unknown; referer?: string; accept?: string } = {}) {
    const headers: Record<string, string> = {
      ...BROWSER_HEADERS,
      Accept: init.accept ?? "application/json",
      Origin: BASE,
      Referer: `${BASE}${init.referer ?? "/no/"}`,
      Cookie: cookieHeader(this.jar),
    };
    if (this.jar.csrftoken) headers["X-CSRFToken"] = this.jar.csrftoken;
    if (init.body !== undefined) headers["Content-Type"] = "application/json";

    let res: Response;
    try {
      res = await fetch(`${BASE}${path}`, {
        method: init.method ?? "GET",
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        redirect: "follow",
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new OdaError("Får ikke kontakt med Oda akkurat nå.", "network");
    }
    this.jar = applySetCookies(this.jar, res.headers.getSetCookie());
    if (res.status === 401 || res.status === 403) {
      throw new OdaError("Oda-innloggingen har gått ut. Koble til Oda på nytt.", "auth");
    }
    if (res.status === 425 || res.status === 429 || res.status >= 500) {
      throw new OdaError("Oda er opptatt akkurat nå. Prøv igjen om litt.", "network");
    }
    return res;
  }

  /** Logger inn med e-post og passord. Passordet brukes bare her og lagres ikke. */
  async login(email: string, password: string): Promise<void> {
    await this.request("/no/user/login/", { accept: "text/html" });
    if (!this.jar.csrftoken) throw new OdaError("Fikk ikke startet innlogging hos Oda.", "network");
    const res = await this.request("/api/v1/user/login/", {
      method: "POST",
      body: { username: email, password },
      referer: "/no/user/login/",
    }).catch((e) => {
      if (e instanceof OdaError && e.kind === "auth") throw new OdaError("Feil e-post eller passord hos Oda.", "auth");
      throw e;
    });
    if (!res.ok) throw new OdaError("Feil e-post eller passord hos Oda.", "auth");
  }

  async search(query: string, limit = 8): Promise<OdaProduct[]> {
    const res = await this.request(`/no/search/products/?q=${encodeURIComponent(query)}`, {
      accept: "text/html,application/xhtml+xml",
      referer: "/no/search/products/",
    });
    if (!res.ok) throw new OdaError(`Søket hos Oda feilet (${res.status}).`);
    return parseSearchHtml(await res.text()).slice(0, limit);
  }

  async cart(): Promise<CartSummary> {
    const res = await this.request("/api/v1/cart/", { referer: "/no/cart/" });
    if (!res.ok) throw new OdaError(`Fikk ikke hentet handlekurven (${res.status}).`);
    const json = (await res.json()) as { product_quantity_count?: number; display_price?: string };
    return { itemCount: json.product_quantity_count ?? 0, total: json.display_price ?? null };
  }

  /** Legger varer i handlekurven. quantity er en økning (Oda bruker deltaer), aldri en bestilling. */
  async addToCart(items: { productId: number; quantity: number }[]): Promise<CartSummary> {
    const res = await this.request("/api/v1/cart/items/", {
      method: "POST",
      body: { items: items.map((i) => ({ product_id: i.productId, quantity: i.quantity })) },
      referer: "/no/cart/",
    });
    if (!res.ok) throw new OdaError(`Oda godtok ikke varene (${res.status}).`);
    const json = (await res.json()) as { product_quantity_count?: number; display_price?: string };
    return { itemCount: json.product_quantity_count ?? 0, total: json.display_price ?? null };
  }

  /** Produkter familien kjøper ofte, fra de siste ordrene. Brukes som hint til agenten. */
  async frequentProducts(maxOrders = 6): Promise<{ id: number; name: string; timesBought: number }[]> {
    const res = await this.request("/api/v1/orders/", { referer: "/no/account/orders/" });
    if (!res.ok) return [];
    const list = (await res.json()) as { results?: { orders?: { order_number?: string }[] }[] };
    const numbers = (list.results ?? [])
      .flatMap((m) => m.orders ?? [])
      .map((o) => o.order_number)
      .filter((n): n is string => typeof n === "string" && /^\w+$/.test(n))
      .slice(0, maxOrders);
    const orders = await Promise.all(
      numbers.map(async (n) => {
        try {
          const r = await this.request(`/api/v1/orders/${n}/`, { referer: "/no/account/orders/" });
          return r.ok ? await r.json() : null;
        } catch {
          return null;
        }
      })
    );
    return countPurchases(orders.filter(Boolean));
  }
}
