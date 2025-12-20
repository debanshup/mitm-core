import net from "net";
export function createHTTPSUpstream(host: string, port: number): net.Socket {
  const upstream = net.connect({
    port,
    host,
  });

  upstream.on("error", (e) => {
    if (!upstream.destroyed) {
      upstream.destroy();
    }
    console.error("https upstream", e, "for", host);
  });
  upstream.on("close", () => {
    if (!upstream.destroyed) {
      upstream.destroy();
    }
  });
  // disable nagle's
  upstream.setNoDelay(true);
  return upstream;
}
