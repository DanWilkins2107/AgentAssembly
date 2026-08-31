import {
  createConnection,
  createServer,
  type AddressInfo,
  type Server,
  type Socket,
} from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_HEAD_BYTES } from "./head.js";
import { denyAll, type Policy } from "./policy.js";
import { createProxy } from "./proxy.js";

const ALLOWED_PORT = 443;
const ESTABLISHED = "HTTP/1.1 200 Connection Established\r\n\r\n";

// 443 is the only port the proxy will ever dial and a test box cannot bind it,
// so record what it asked for and land the socket on the test origin instead.
// Anything the proxy dials on another port would leave the box - `outbound`
// staying empty is the "no socket was opened" assertion.
const outbound: Array<{ host: string; port: number }> = [];
let originPort = 0;

vi.mock("node:net", async (importOriginal) => {
  const net = await importOriginal<typeof import("node:net")>();
  return {
    ...net,
    connect: (
      options: { host: string; port: number },
      onConnect: () => void,
    ) => {
      outbound.push({ host: options.host, port: options.port });
      const target =
        options.port === ALLOWED_PORT
          ? { host: "127.0.0.1", port: originPort }
          : options;
      return net.connect(target, onConnect);
    },
  };
});

const listen = (server: Server) =>
  new Promise<number>((resolve) => {
    server.listen(0, "127.0.0.1", () =>
      resolve((server.address() as AddressInfo).port),
    );
  });

const live = new Set<Socket>();

const track = (server: Server) => {
  server.on("connection", (socket: Socket) => {
    live.add(socket);
    socket.on("close", () => live.delete(socket));
  });
  return server;
};

const shutdown = (server: Server) =>
  new Promise<void>((resolve) => {
    for (const socket of live) socket.destroy();
    server.close(() => resolve());
  });

const open = (port: number) => {
  const socket = createConnection({ host: "127.0.0.1", port });
  const state = { received: "", closed: false };
  socket.on("data", (data: Buffer) => {
    state.received += data.toString("latin1");
  });
  socket.on("close", () => {
    state.closed = true;
  });
  socket.on("error", () => {
    state.closed = true;
  });
  return { socket, state };
};

let proxy: Server;
let origin: Server;
let lines: string[];
let originHits: number;
let policyCalls: Array<{
  host: string;
  port: number;
  auth: string | undefined;
}>;

const start = (
  policy: Policy,
  options: { headTimeoutMs?: number; reset?: boolean } = {},
) => {
  origin = createServer((socket) => {
    originHits += 1;
    // Resetting on the first byte rather than on accept keeps the tunnel
    // established before it drops - an accept-time reset races the connect.
    if (options.reset === true) {
      socket.once("data", () => socket.resetAndDestroy());
      return;
    }
    socket.pipe(socket);
  });
  // A sink per proxy: a socket torn down after the next test starts must not be
  // able to append to that test's lines.
  const sink: string[] = [];
  lines = sink;
  proxy = createProxy({
    policy: (host, port, auth) => {
      policyCalls.push({ host, port, auth });
      return policy(host, port, auth);
    },
    log: (line) => sink.push(line),
    headTimeoutMs: options.headTimeoutMs,
  });
  return listen(track(origin)).then(async (port) => {
    originPort = port;
    return listen(track(proxy));
  });
};

// A stand-in for the table 8111bb4e will land, doing the exact-match half of the
// allowlist contract. It is here to prove what the core hands the hook, not to
// implement the hook.
const exactly =
  (allowed: string): Policy =>
  (host) =>
    host === allowed
      ? { allow: true, session: "sess-1" }
      : { allow: false, status: 403, session: "sess-1" };

// The leading-dot half: a suffix entry matches only at a label boundary.
const underDot: Policy = (host) =>
  host === "githubusercontent.com" || host.endsWith(".githubusercontent.com")
    ? { allow: true, session: "sess-1" }
    : { allow: false, status: 403, session: "sess-1" };

const talk = async (port: number, request: string | Buffer) => {
  const { socket, state } = open(port);
  socket.write(request);
  await vi.waitFor(
    () => {
      expect(state.closed).toBe(true);
    },
    { timeout: 5000 },
  );
  return state.received;
};

const logged = async () => {
  await vi.waitFor(() => {
    expect(lines).toHaveLength(1);
  });
  return lines[0] ?? "";
};

beforeEach(() => {
  outbound.length = 0;
  lines = [];
  policyCalls = [];
  originHits = 0;
});

afterEach(async () => {
  await shutdown(proxy);
  await shutdown(origin);
});

describe("non-CONNECT requests", () => {
  it("refuses a plaintext GET with 405 and never dials anything", async () => {
    const port = await start(exactly("example.com"));

    const response = await talk(
      port,
      "GET http://example.com/secret?token=abc HTTP/1.1\r\nHost: example.com\r\n\r\n",
    );

    expect(response).toContain("405 Method Not Allowed");
    expect(policyCalls).toEqual([]);
    expect(outbound).toEqual([]);
    expect(originHits).toBe(0);
    expect(await logged()).toMatch(
      /^\d+\.\d{3} - GET TCP_DENIED\/405 \d+ -\n$/,
    );
  });

  it("keeps the refused request's path and query out of the log", async () => {
    const port = await start(exactly("example.com"));

    await talk(
      port,
      "GET http://example.com/doc?token=SUPERSECRETTOKEN HTTP/1.1\r\n\r\n",
    );

    for (const leak of ["SUPERSECRETTOKEN", "/doc", "?", "http://"]) {
      expect(await logged()).not.toContain(leak);
    }
  });
});

describe("the port rule", () => {
  it("refuses any port but 443 with 403, before the policy is asked", async () => {
    for (const target of [
      "example.com:80",
      "example.com:8443",
      "example.com:1",
    ]) {
      const port = await start(exactly("example.com"));

      const response = await talk(port, `CONNECT ${target} HTTP/1.1\r\n\r\n`);

      expect(response).toContain("403 Forbidden");
      expect(policyCalls).toEqual([]);
      expect(outbound).toEqual([]);
      expect(originHits).toBe(0);
      expect(await logged()).toContain(`CONNECT TCP_DENIED/403 `);
      expect(await logged()).toContain(target);
      await shutdown(proxy);
      await shutdown(origin);
    }
  });
});

describe("deny by default", () => {
  it("tunnels nothing with the core's own policy", async () => {
    const port = await start(denyAll);

    const response = await talk(
      port,
      "CONNECT github.com:443 HTTP/1.1\r\nProxy-Authorization: Basic abc\r\n\r\n",
    );

    expect(response).toContain("403 Forbidden");
    expect(policyCalls).toEqual([
      { host: "github.com", port: 443, auth: "Basic abc" },
    ]);
    expect(outbound).toEqual([]);
    expect(originHits).toBe(0);
    expect(await logged()).toMatch(
      /^\d+\.\d{3} - CONNECT TCP_DENIED\/403 \d+ github\.com:443\n$/,
    );
  });

  it("asks the hook before it opens a socket, never after", async () => {
    const port = await start(() => {
      expect(outbound).toEqual([]);
      return { allow: false, status: 403 };
    });

    await talk(port, "CONNECT example.com:443 HTTP/1.1\r\n\r\n");

    expect(policyCalls).toHaveLength(1);
    expect(outbound).toEqual([]);
  });

  it("writes whatever status the hook chose", async () => {
    const port = await start(() => ({
      allow: false,
      status: 407,
      session: "sess-1",
    }));

    const response = await talk(
      port,
      "CONNECT example.com:443 HTTP/1.1\r\n\r\n",
    );

    expect(response).toContain("407 Proxy Authentication Required");
    expect(await logged()).toContain("sess-1 CONNECT TCP_DENIED/407");
  });

  it("still refuses cleanly on a status it has no name for", async () => {
    const port = await start(() => ({ allow: false, status: 599 }));

    const response = await talk(
      port,
      "CONNECT example.com:443 HTTP/1.1\r\n\r\n",
    );

    expect(response).toContain("599 Proxy Refused");
    expect(outbound).toEqual([]);
  });
});

describe("what the hook is handed", () => {
  it("denies near-miss hostnames against an exact entry", async () => {
    for (const host of [
      "evil-example.com",
      "evilexample.com",
      "notexample.com",
      "example.como",
      "example.com.evil.net",
      "wwwexample.com",
    ]) {
      const port = await start(exactly("example.com"));

      const response = await talk(port, `CONNECT ${host}:443 HTTP/1.1\r\n\r\n`);

      expect(response).toContain("403 Forbidden");
      expect(policyCalls.at(-1)?.host).toBe(host);
      expect(outbound).toEqual([]);
      expect(originHits).toBe(0);
      await shutdown(proxy);
      await shutdown(origin);
    }
  });

  it("denies a suffix near-miss against a leading-dot entry", async () => {
    for (const host of [
      "evilgithubusercontent.com",
      "githubusercontent.com.evil.net",
      "xgithubusercontent.com",
    ]) {
      const port = await start(underDot);

      const response = await talk(port, `CONNECT ${host}:443 HTTP/1.1\r\n\r\n`);

      expect(response).toContain("403 Forbidden");
      expect(outbound).toEqual([]);
      await shutdown(proxy);
      await shutdown(origin);
    }
  });

  it("hands over a lowercased host, so case cannot smuggle one past", async () => {
    const port = await start(exactly("example.com"));

    const { socket, state } = open(port);
    socket.write("CONNECT ExAmPlE.CoM:443 HTTP/1.1\r\n\r\n");
    await vi.waitFor(() => {
      expect(state.received).toContain("200 Connection Established");
    });

    expect(policyCalls).toEqual([
      { host: "example.com", port: 443, auth: undefined },
    ]);
    socket.destroy();
  });
});

describe("malformed requests", () => {
  it("refuses an unparseable request line with 400", async () => {
    const port = await start(exactly("example.com"));

    const response = await talk(port, "GARBAGE\r\n\r\n");

    expect(response).toContain("400 Bad Request");
    expect(policyCalls).toEqual([]);
    expect(await logged()).toMatch(/^\d+\.\d{3} - - TCP_DENIED\/400 \d+ -\n$/);
  });

  it("refuses an empty request line rather than waiting on more", async () => {
    const port = await start(exactly("example.com"), { headTimeoutMs: 5000 });

    const response = await talk(port, "\r\n\r\n");

    expect(response).toContain("400 Bad Request");
    expect(outbound).toEqual([]);
  });

  it("refuses a head with no terminator once it passes 8 KiB", async () => {
    const port = await start(exactly("example.com"));

    const response = await talk(port, "A".repeat(9000));

    expect(response).toContain("400 Bad Request");
    expect(outbound).toEqual([]);
  });

  it("refuses a terminated head that is over 8 KiB", async () => {
    const port = await start(exactly("example.com"));

    const response = await talk(
      port,
      `CONNECT example.com:443 HTTP/1.1\r\nX-Pad: ${"a".repeat(9000)}\r\n\r\n`,
    );

    expect(response).toContain("400 Bad Request");
    expect(policyCalls).toEqual([]);
    expect(outbound).toEqual([]);
  });

  it("accepts a head that is exactly 8 KiB, in one chunk or two", async () => {
    const prefix = "CONNECT example.com:443 HTTP/1.1\r\nX-Pad: ";
    const exact = prefix + "a".repeat(MAX_HEAD_BYTES - prefix.length);
    expect(exact).toHaveLength(MAX_HEAD_BYTES);

    for (const chunks of [[`${exact}\r\n\r\n`], [exact, "\r\n\r\n"]]) {
      const port = await start(exactly("example.com"));

      const { socket, state } = open(port);
      for (const chunk of chunks) {
        socket.write(chunk);
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      await vi.waitFor(() => {
        expect(state.received).toContain("200 Connection Established");
      });

      socket.destroy();
      await shutdown(proxy);
      await shutdown(origin);
    }
  });

  it("refuses a head that never arrives", async () => {
    const port = await start(exactly("example.com"), { headTimeoutMs: 50 });

    const response = await talk(port, "CONNECT example.com:443 HTTP/1.1\r\n");

    expect(response).toContain("400 Bad Request");
    expect(outbound).toEqual([]);
    expect(await logged()).toContain("- - TCP_DENIED/400");
  });

  it("survives a client that resets mid-head", async () => {
    const port = await start(exactly("example.com"));

    const { socket } = open(port);
    socket.write("CONNECT example.com");
    socket.resetAndDestroy();

    await vi.waitFor(() => {
      expect(proxy.listening).toBe(true);
    });
    expect(outbound).toEqual([]);
  });
});

describe("the tunnel", () => {
  it("copies bytes both ways and logs one line on close", async () => {
    const port = await start(exactly("example.com"));

    const { socket, state } = open(port);
    socket.write(
      "CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n\r\n",
    );
    await vi.waitFor(() => {
      expect(state.received).toContain("200 Connection Established");
    });
    socket.write("ping");
    await vi.waitFor(() => {
      expect(state.received).toContain("ping");
    });

    expect(outbound).toEqual([{ host: "example.com", port: 443 }]);
    expect(state.received).toBe(`${ESTABLISHED}ping`);
    socket.end();

    // The byte count is the 200 line plus the four echoed back, and nothing else.
    expect(await logged()).toMatch(
      new RegExp(
        `^\\d+\\.\\d{3} sess-1 CONNECT TCP_TUNNEL/200 ${ESTABLISHED.length + 4} example\\.com:443\\n$`,
      ),
    );
  });

  it("forwards bytes that arrived with the head, and only those", async () => {
    const port = await start(exactly("example.com"));

    const { socket, state } = open(port);
    socket.write("CONNECT example.com:443 HTTP/1.1\r\n\r\nearly-bytes");
    await vi.waitFor(() => {
      expect(state.received).toBe(`${ESTABLISHED}early-bytes`);
    });

    socket.end();
    expect(await logged()).toContain("TCP_TUNNEL/200");
  });

  it("logs 502 when the upstream refuses, and asks nothing of the client", async () => {
    const port = await start(exactly("example.com"));
    await shutdown(origin);

    const response = await talk(
      port,
      "CONNECT example.com:443 HTTP/1.1\r\n\r\n",
    );

    expect(response).toContain("502 Bad Gateway");
    expect(await logged()).toMatch(
      /^\d+\.\d{3} sess-1 CONNECT TCP_MISS\/502 \d+ example\.com:443\n$/,
    );
  });

  it("logs once when the upstream drops an established tunnel", async () => {
    const port = await start(exactly("example.com"), { reset: true });

    const { socket, state } = open(port);
    socket.write("CONNECT example.com:443 HTTP/1.1\r\n\r\n");
    await vi.waitFor(() => {
      expect(state.received).toContain("200 Connection Established");
    });
    socket.write("ping");
    await vi.waitFor(() => {
      expect(state.closed).toBe(true);
    });

    expect(await logged()).toContain("CONNECT TCP_TUNNEL/200");
  });
});
