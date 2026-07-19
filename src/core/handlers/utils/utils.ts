import destr from "destr";
import type { Readable } from "stream";
import zlib from "zlib";

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




/**
 * Decompresses and parses a raw request buffer based on its content-encoding.
 */
export function parseBody(
  rawBuffer: Buffer,
  contentEncodingHeader?: string,
): any {
  if (!rawBuffer || rawBuffer.length === 0) {
    return null;
  }

  const encoding = (contentEncodingHeader || "").toLowerCase();
  let decompressedBuffer = rawBuffer;

  try {
    if (encoding === "gzip") {
      decompressedBuffer = zlib.gunzipSync(rawBuffer);
    } else if (encoding === "deflate") {
      decompressedBuffer = zlib.inflateSync(rawBuffer);
    } else if (encoding === "br") {
      decompressedBuffer = zlib.brotliDecompressSync(rawBuffer);
    }
  } catch (decompressionError) {
    console.error("Failed to decompress body buffer:", decompressionError);
    // Fall back to trying to read the raw buffer anyway
    decompressedBuffer = rawBuffer;
  }

  const rawBody = decompressedBuffer.toString("utf-8").trim();

  return destr(rawBody);
}

/**
 * Helper to read a stream into a single Buffer
 */
export function readStream(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", (err) => reject(err));
  });
}







