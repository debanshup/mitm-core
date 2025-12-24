import net from "net";
export function createHTTPSUpstream(host: string, port: number): net.Socket {
  const upstream = net.connect({
    port,
    host,
  });
  // disable nagle's
  upstream.setNoDelay(true);
  return upstream;
}
