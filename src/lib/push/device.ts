/** Kort navn på enheten ut fra nettleserens user agent, f.eks. «iPhone», «iPad», «Android (Chrome)», «Mac (Safari)». */
export function deviceLabel(ua: string, touchPoints = 0): string {
  // iPad med iPadOS 13+ later som den er en Mac, men har berøringsskjerm.
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Macintosh/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : /Linux/.test(ua)
              ? "Linux"
              : "Enhet";
  if (os === "iPhone" || os === "iPad") return os;
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : null;
  return browser ? `${os} (${browser})` : os;
}
