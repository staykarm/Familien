/**
 * Leser data ut av Oda sine sider og svar. Oda har ikke et offisielt API; søkeresultater ligger som
 * React Query-tilstand i sidens Next.js-strøm (self.__next_f.push(...)). Se README → Oda.
 * Ren logikk uten nettverk, så den kan testes med eksempel-HTML.
 */

export interface OdaProduct {
  id: number;
  name: string;
  /** F.eks. «0,1% fett, 1 l» */
  extra: string;
  brand: string | null;
  price: number | null;
  unitPrice: string | null;
  available: boolean;
  imageUrl: string | null;
}

/** Finner slutten på JSON-verdien som starter ved `start` (respekterer strenger) og parser den. */
export function parseJsonAt(text: string, start: number): unknown {
  const open = text[start];
  if (open !== "[" && open !== "{") return null;
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Slår sammen Next.js-strømmen (bitene kan være delt hvor som helst, så de må settes sammen først). */
export function flightPayload(html: string): string {
  const re = /self\.__next_f\.push\(\s*/g;
  let out = "";
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const arr = parseJsonAt(html, m.index + m[0].length);
    if (Array.isArray(arr) && arr[0] === 1 && typeof arr[1] === "string") out += arr[1];
  }
  return out;
}

interface DehydratedQuery {
  queryKey: unknown[];
  state?: { data?: unknown };
}

/** Alle React Query-oppføringer på siden (nytt App Router-format og gammelt __NEXT_DATA__-format). */
export function dehydratedQueries(html: string): DehydratedQuery[] {
  const legacy = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (legacy) {
    try {
      const data = JSON.parse(legacy[1]) as { props?: { pageProps?: { dehydratedState?: { queries?: DehydratedQuery[] } } } };
      const q = data.props?.pageProps?.dehydratedState?.queries;
      if (q?.length) return q;
    } catch {
      // Prøv det nye formatet.
    }
  }
  const flight = flightPayload(html);
  const out: DehydratedQuery[] = [];
  const re = /"queries"\s*:\s*\[/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(flight)) !== null) {
    const arr = parseJsonAt(flight, m.index + m[0].length - 1);
    if (Array.isArray(arr)) out.push(...arr.filter((q): q is DehydratedQuery => !!q && typeof q === "object" && "queryKey" in q));
  }
  return out;
}

export function findQueryData(queries: DehydratedQuery[], name: string): unknown {
  for (const q of queries) {
    const first = Array.isArray(q.queryKey) ? q.queryKey[0] : undefined;
    if (first === name || (typeof first === "object" && first !== null && (first as { _id?: string })._id === name)) {
      return q.state?.data ?? null;
    }
  }
  return null;
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Produkter fra søkesiden (`mixedSearch`). */
export function parseSearchHtml(html: string): OdaProduct[] {
  const data = findQueryData(dehydratedQueries(html), "mixedSearch") as { items?: unknown[] } | null;
  return (data?.items ?? []).flatMap((raw) => {
    const item = raw as { type?: string; attributes?: Record<string, unknown> };
    const a = item.attributes;
    if (item.type !== "product" || !a || typeof a.id !== "number") return [];
    const images = a.images as { thumbnail?: { url?: string } }[] | undefined;
    const availability = a.availability as { isAvailable?: boolean } | undefined;
    return [
      {
        id: a.id,
        name: String(a.fullName ?? a.name ?? ""),
        extra: String(a.nameExtra ?? ""),
        brand: typeof a.brand === "string" ? a.brand : null,
        price: num(a.grossPrice),
        unitPrice: a.grossUnitPrice ? `${a.grossUnitPrice} kr/${a.unitPriceQuantityAbbreviation ?? "stk"}` : null,
        available: availability?.isAvailable !== false,
        imageUrl: images?.[0]?.thumbnail?.url ?? null,
      },
    ];
  });
}

/** Antall ganger hvert produkt er kjøpt, fra ordredetaljer (samme produkt kan stå i flere grupper per ordre). */
export function countPurchases(orders: { items?: { item_groups?: { items?: { product_id?: number; description?: string }[] }[] } }[]) {
  const counts = new Map<number, { count: number; name: string }>();
  for (const order of orders) {
    const seen = new Set<number>();
    for (const group of order.items?.item_groups ?? []) {
      for (const it of group.items ?? []) {
        if (typeof it.product_id !== "number" || seen.has(it.product_id)) continue;
        seen.add(it.product_id);
        const prev = counts.get(it.product_id);
        counts.set(it.product_id, { count: (prev?.count ?? 0) + 1, name: prev?.name ?? it.description ?? "" });
      }
    }
  }
  return [...counts.entries()]
    .map(([id, v]) => ({ id, name: v.name, timesBought: v.count }))
    .sort((a, b) => b.timesBought - a.timesBought);
}

// --- Cookies -----------------------------------------------------------------------

/** Oppdaterer en enkel cookie-krukke fra Set-Cookie-headere. Utløpte/slettede cookies fjernes. */
export function applySetCookies(jar: Record<string, string>, setCookies: string[]): Record<string, string> {
  const next = { ...jar };
  for (const header of setCookies) {
    const [pair, ...attrs] = header.split(";");
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    const expired = attrs.some((a) => {
      const [k, v] = a.trim().split("=");
      if (k.toLowerCase() === "max-age") return Number(v) <= 0;
      if (k.toLowerCase() === "expires") return Date.parse(a.trim().slice(8)) < Date.now();
      return false;
    });
    if (expired || value === "" || value === '""') delete next[name];
    else next[name] = value;
  }
  return next;
}

export function cookieHeader(jar: Record<string, string>): string {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}
