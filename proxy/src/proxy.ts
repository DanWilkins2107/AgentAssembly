// CONNECT-only proxy. One request head is parsed; from the 200 onward the
// connection is a raw two-way byte copy with no HTTP awareness. There is no
// forwarding code path at all, so a plaintext request cannot be proxied by a
// bug - only refused.

import { connect, createServer, type Server, type Socket } from "node:net";
import { MAX_HEAD_BYTES, parseHead } from "./head.js";
import { logLine, UNKNOWN } from "./log.js";
import type { Policy } from "./policy.js";

const HEAD_TIMEOUT_MS = 10_000;
// Core's own rule, ahead of the policy hook: nothing but HTTPS leaves the box.
const ALLOWED_PORT = 443;

const TERMINATOR = "\r\n\r\n";
const ESTABLISHED = "HTTP/1.1 200 Connection Established\r\n\r\n";

const STATUS_TEXT: Record<number, string> = {
  400: "Bad Request",
  403: "Forbidden",
  405: "Method Not Allowed",
  407: "Proxy Authentication Required",
  502: "Bad Gateway",
};

export type ProxyOptions = {
  policy: Policy;
  log: (line: string) => void;
  headTimeoutMs?: number | undefined;
};

type Refusal = {
  status: number;
  method: string;
  host?: string | undefined;
  session?: string | undefined;
};

function handle(client: Socket, options: ProxyOptions): void {
  let buffer = Buffer.alloc(0);
  let logged = false;

  const record = (entry: Refusal & { bytes: number }) => {
    if (logged) return;
    logged = true;
    options.log(
      logLine({
        at: Date.now(),
        session: entry.session,
        method: entry.method,
        status: entry.status,
        bytes: entry.bytes,
        host: entry.host,
      }),
    );
  };

  const refuse = (refusal: Refusal) => {
    const text = STATUS_TEXT[refusal.status] ?? "Proxy Refused";
    const response = `HTTP/1.1 ${refusal.status} ${text}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`;
    // Stop reading first. A refusal on the read timeout would otherwise be
    // followed by the head finally arriving and opening a tunnel that the
    // already-spent log line could never record. `end` below destroys the
    // socket anyway once the response flushes, which is why no test can tell
    // this line from its absence - it closes the window before that flush.
    // Stryker disable next-line StringLiteral: guards an unobservable race; see above
    client.off("data", onData);
    record({ ...refusal, bytes: Buffer.byteLength(response) });
    client.end(response);
  };

  const tunnel = (
    host: string,
    port: number,
    session: string | undefined,
    method: string,
    rest: Buffer,
  ) => {
    let bytes = Buffer.byteLength(ESTABLISHED);
    let established = false;
    const upstream = connect({ host, port }, () => {
      established = true;
      client.write(ESTABLISHED);
      upstream.write(rest);
      upstream.on("data", (data: Buffer) => {
        bytes += data.length;
      });
      upstream.pipe(client);
      client.pipe(upstream);
    });

    const shut = () => {
      client.destroy();
      upstream.destroy();
      if (established) record({ status: 200, method, bytes, host, session });
    };

    upstream.on("error", () => {
      if (established) return shut();
      refuse({ status: 502, method, host, session });
    });
    // An upstream close ends the client through the pipe, so the client's own
    // close is the one place the tunnel is logged and both ends are torn down.
    client.on("close", shut);
  };

  const dispatch = (text: string, rest: Buffer) => {
    const parsed = parseHead(text);
    if (!parsed.ok) {
      return refuse({ status: parsed.status, method: parsed.method });
    }
    const { host, port, proxyAuthorization } = parsed.head;
    if (port !== ALLOWED_PORT) {
      return refuse({ status: 403, method: parsed.method, host });
    }
    // Deny by default: no outbound socket exists before this answers.
    const decision = options.policy(host, port, proxyAuthorization);
    if (!decision.allow) {
      return refuse({
        status: decision.status,
        method: parsed.method,
        host,
        session: decision.session,
      });
    }
    tunnel(host, port, decision.session, parsed.method, rest);
  };

  const onData = (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    const end = buffer.indexOf(TERMINATOR);
    if (end < 0) {
      if (buffer.length <= MAX_HEAD_BYTES) return;
      return refuse({ status: 400, method: UNKNOWN });
    }
    client.off("data", onData);
    // The head is in, so the read timeout is spent. Leaving it armed would let
    // it fire while upstream is still connecting and refuse a live tunnel.
    client.setTimeout(0);
    if (end > MAX_HEAD_BYTES) {
      return refuse({ status: 400, method: UNKNOWN });
    }
    // Anything past the head is the client's first tunnel bytes, held until
    // upstream is up. It is forwarded verbatim and never parsed.
    client.pause();
    dispatch(
      buffer.subarray(0, end).toString("latin1"),
      buffer.subarray(end + TERMINATOR.length),
    );
  };

  client.setTimeout(options.headTimeoutMs ?? HEAD_TIMEOUT_MS);
  client.on("timeout", () => {
    refuse({ status: 400, method: UNKNOWN });
  });
  // A client reset is routine; node destroys the socket itself, so this only
  // has to stop an unhandled `error` from taking the whole proxy down.
  client.on("error", () => {});
  client.on("data", onData);
}

export function createProxy(options: ProxyOptions): Server {
  return createServer((client) => handle(client, options));
}
