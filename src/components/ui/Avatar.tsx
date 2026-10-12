/* eslint-disable @next/next/no-img-element -- signerte Supabase-URL-er, ikke optimaliserbare via next/image */
interface AvatarProps {
  name: string;
  color: string;
  icon: string;
  url?: string | null;
  size?: number;
  ring?: boolean;
}

/** Rund avatar i medlemmets farge – profilbilde hvis det finnes, ellers ikonet. */
export function Avatar({ name, color, icon, url, size = 48, ring = true }: AvatarProps) {
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full"
      style={{
        width: size,
        height: size,
        background: `${color}33`,
        boxShadow: ring ? `0 0 0 ${Math.max(2, size / 16)}px ${color}` : undefined,
        fontSize: size * 0.5,
      }}
      title={name}
    >
      {url ? (
        <img src={url} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden>{icon}</span>
      )}
    </span>
  );
}
