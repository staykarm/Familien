import { ImageResponse } from "next/og";
import { appIconElement } from "@/lib/appIcon";

const size = 512;

export const dynamic = "force-static";

export async function GET() {
  return new ImageResponse(appIconElement(size), { width: size, height: size });
}
