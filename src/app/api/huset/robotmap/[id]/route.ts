import { getState, haConfigured, haFetch } from "@/lib/huset/ha";
import { requireFamily } from "@/lib/session";

/**
 * Kartet fra en Roborock-støvsuger (image.<navn>_map_N i Home Assistant). Hentes via serveren, siden Home Assistant
 * krever tokenet. Bare kartbilder kan hentes, og adressen slås opp her. `?v=` endres når kartet oppdateres.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/huset/robotmap/[id]">) {
  await requireFamily();
  const { id } = await ctx.params;
  if (!/^image\.[a-z0-9_]+_map_\d+$/.test(id) || !haConfigured()) return new Response(null, { status: 404 });

  try {
    const state = await getState(id);
    const picture = state?.attributes.entity_picture;
    if (typeof picture !== "string" || !picture.startsWith("/api/image_proxy/")) return new Response(null, { status: 404 });
    const res = await haFetch(picture, { headers: { "Content-Type": "" } });
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return new Response(null, { status: 404 });
    return new Response(res.body, {
      headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600" },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
