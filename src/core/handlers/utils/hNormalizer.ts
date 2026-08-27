
export type NormalizedHttpVersion = "h1" | "h2" | "h3" | "unknown";

/**
 * Normalizes fragmented HTTP version strings from ALPN or llhttp
 * into a standard internal proxy format.
 * * @param rawVersion - The raw string from req.httpVersion or tlsSocket.alpnProtocol
 */
export function normalizeHttpVersion(
  rawVersion: string | number | undefined | null | boolean,
): NormalizedHttpVersion {
  if (!rawVersion) return "unknown";

  const sanitized = String(rawVersion).trim().toLowerCase();

  switch (sanitized) {
    case "h2":
    case "h2c": // HTTP/2 Cleartext
      return "h2";
    case "h3":
      return "h3";
    case "h1":
    case "http/1.1":
    case "http/1.0":
      return "h1";
  }

  if (sanitized.startsWith("1.") || sanitized === "1") return "h1";
  if (sanitized.startsWith("2.") || sanitized === "2") return "h2";
  if (sanitized.startsWith("3.") || sanitized === "3") return "h3";

  // Captures the major version number from strings like "http/2", "v2.0", etc.
  const match = sanitized.match(/(?:http\/|v)?([1-3])(?:\.[0-9])?/);

  if (match && match[1]) {
    return `h${match[1]}` as NormalizedHttpVersion;
  }

  return "unknown";
}
