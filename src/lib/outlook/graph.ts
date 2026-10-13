import "server-only";

export const GRAPH = "https://graph.microsoft.com/v1.0";

export class GraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
  }
}

interface RequestInit {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Liten klient mot Microsoft Graph. `getToken(force)` gir et gyldig access token (fornyer ved behov).
 * Prøver på nytt ved 401 (ny token), og ved 429/503 etter Retry-After (maks 10 sek).
 */
export class GraphClient {
  constructor(private getToken: (force?: boolean) => Promise<string>) {}

  async request(pathOrUrl: string, init: RequestInit = {}): Promise<Response> {
    const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `${GRAPH}${pathOrUrl}`;
    let forceToken = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      const token = await this.getToken(forceToken);
      let res: Response;
      try {
        res = await fetch(url, {
          method: init.method ?? "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
            ...init.headers,
          },
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
          cache: "no-store",
          signal: AbortSignal.timeout(25_000),
        });
      } catch {
        if (attempt < 2) continue;
        throw new GraphError("Får ikke kontakt med Outlook akkurat nå.", 0);
      }
      if (res.status === 401 && !forceToken) {
        forceToken = true;
        continue;
      }
      if ((res.status === 429 || res.status === 503 || res.status === 504) && attempt < 3) {
        const wait = Math.min(Number(res.headers.get("Retry-After")) || 2, 10);
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }
      return res;
    }
    throw new GraphError("Outlook svarer ikke. Prøv igjen senere.", 503);
  }

  /** Som `request`, men kaster ved feil og leser JSON. */
  async json<T>(pathOrUrl: string, init: RequestInit = {}): Promise<T> {
    const res = await this.request(pathOrUrl, init);
    if (!res.ok) throw await graphError(res);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
}

export async function graphError(res: Response): Promise<GraphError> {
  const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  const code = body?.error?.code;
  const message =
    res.status === 403
      ? "Outlook ga ikke tilgang. Har kontoen skrivetilgang til kalenderen?"
      : res.status === 404
        ? "Fant ikke det som ble spurt etter i Outlook."
        : `Feil fra Outlook (${res.status}${code ? ` ${code}` : ""}).`;
  console.error("Graph-feil", res.status, code, body?.error?.message);
  return new GraphError(message, res.status, code);
}
