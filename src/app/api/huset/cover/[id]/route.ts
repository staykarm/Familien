import { getState, haConfigured, haFetch } from "@/lib/huset/ha";
import { requireFamily } from "@/lib/session";

/**
 * Coveret til det som spilles på en høyttaler. Hentes via serveren, siden Home Assistant krever tokenet.
 * Adressen til bildet slås opp på nytt her (aldri fra nettleseren), så bare høyttalernes cover kan hentes.
 * `?v=` endres når coveret endres, så svaret kan bufres i nettleseren.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/huset/cover/[id]">) {
  await requireFamily();
  const { id } = await ctx.params;
  if (!/^media_player\.[a-z0-9_]+$/.test(id) || !haConfigured()) return new Response(null, { status: 404 });

  try {
    const state = await getState(id);
    const picture = state?.attributes.entity_picture;
    if (typeof picture !== "string" || !picture.startsWith("/api/")) return new Response(null, { status: 404 });
    const res = await haFetch(picture, { headers: { "Content-Type": "" } });
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return new Response(null, { status: 404 });
    return new Response(res.body, {
      headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400" },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
