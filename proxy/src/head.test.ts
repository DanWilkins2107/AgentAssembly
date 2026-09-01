import { describe, expect, it } from "vitest";
import { logMethod, parseHead } from "./head.js";

const head = (...lines: string[]) => lines.join("\r\n");
const CONNECT = "CONNECT example.com:443 HTTP/1.1";

const refusal = (text: string) => {
  const parsed = parseHead(text);
  return parsed.ok ? null : parsed.status;
};

describe("parseHead", () => {
  it("accepts a CONNECT and yields the destination", () => {
    expect(parseHead(head(CONNECT, "Host: example.com:443"))).toEqual({
      ok: true,
      method: "CONNECT",
      head: {
        host: "example.com",
        port: 443,
        proxyAuthorization: undefined,
      },
    });
  });

  it("lowercases the host so case cannot dodge an allowlist", () => {
    const parsed = parseHead("CONNECT ExAmPlE.CoM:443 HTTP/1.0");

    expect(parsed.ok && parsed.head.host).toBe("example.com");
  });

  it("leaves the port rule to the caller", () => {
    expect(parseHead("CONNECT example.com:80 HTTP/1.1")).toMatchObject({
      ok: true,
      head: { port: 80 },
    });
    expect(parseHead("CONNECT example.com:65535 HTTP/1.1")).toMatchObject({
      ok: true,
      head: { port: 65535 },
    });
  });

  it("accepts the shortest and longest hostnames it allows", () => {
    for (const host of ["a", "ex.a", "a.b.c", "a".repeat(253)]) {
      expect(parseHead(`CONNECT ${host}:443 HTTP/1.1`)).toMatchObject({
        ok: true,
        head: { host },
      });
    }
  });

  it("keeps Proxy-Authorization, whatever case the name is written in", () => {
    const parsed = parseHead(
      head(
        CONNECT,
        "Host: example.com:443",
        "pRoXy-AuThOrIzAtIoN:  Basic abc ",
      ),
    );

    expect(parsed.ok && parsed.head.proxyAuthorization).toBe("Basic abc");
  });

  it("refuses a non-CONNECT method with 405, not a forward", () => {
    for (const line of [
      "GET http://example.com/ HTTP/1.1",
      "POST http://example.com/ HTTP/1.1",
      "HEAD / HTTP/1.0",
      "OPTIONS * HTTP/1.1",
      "connect example.com:443 HTTP/1.1",
      "BREW / HTTP/1.1",
    ]) {
      expect(refusal(line)).toBe(405);
    }
  });

  it("reports the method for the log only when it is a known token", () => {
    expect(parseHead("GET / HTTP/1.1").method).toBe("GET");
    expect(parseHead("connect example.com:443 HTTP/1.1").method).toBe("-");
    expect(parseHead("").method).toBe("-");
  });

  it("refuses a malformed request line with 400", () => {
    for (const line of [
      "",
      "CONNECT",
      "CONNECT example.com:443",
      "CONNECT example.com:443 HTTP/1.1 extra",
      "CONNECT  example.com:443 HTTP/1.1",
      "CONNECT\texample.com:443\tHTTP/1.1",
      "CONNECT example.com:443 HTTP/2",
      "CONNECT example.com:443 http/1.1",
      "CONNECT example.com:443 xHTTP/1.1",
      "CONNECT example.com:443 HTTP/1.10",
    ]) {
      expect(refusal(line)).toBe(400);
    }
  });

  it("refuses a destination that is not a bare hostname and port", () => {
    for (const target of [
      "example.com",
      // A bare port: with no colon to split on, "44" must not become the host.
      "443",
      ":443",
      `${"a".repeat(254)}:443`,
      "example.com:",
      "example.com:0443",
      "example.com:0",
      "example.com:65536",
      "example.com:443443",
      "example.com:44a",
      // Trailing whitespace that `Number` would quietly swallow back to 443.
      "example.com:443\t",
      "example.com:443\n",
      "example.com:443:443",
      "[::1]:443",
      "user@example.com:443",
      "example.com.:443",
      "-example.com:443",
      "example-.com:443",
      "ex_ample.com:443",
      "ex..ample.com:443",
      "exa mple.com:443",
      `${"a".repeat(254)}:443`,
    ]) {
      expect(refusal(`CONNECT ${target} HTTP/1.1`)).toBe(400);
    }
  });

  it("refuses headers it cannot read unambiguously", () => {
    for (const header of [
      "not-a-header",
      ": empty name",
      "Proxy-Authorization : Basic abc",
      " Host: folded",
      "\tHost: folded",
    ]) {
      expect(refusal(head(CONNECT, header))).toBe(400);
    }
  });

  it("refuses a repeated Proxy-Authorization rather than picking one", () => {
    expect(
      refusal(
        head(
          CONNECT,
          "Proxy-Authorization: Basic a",
          "proxy-authorization: Basic b",
        ),
      ),
    ).toBe(400);
  });

  it("refuses a control byte inside the credential", () => {
    for (const code of [0x00, 0x0b, 0x1f, 0x7f]) {
      expect(
        refusal(
          head(
            CONNECT,
            `Proxy-Authorization: Basic a${String.fromCharCode(code)}b`,
          ),
        ),
      ).toBe(400);
    }
  });
});

describe("logMethod", () => {
  it("passes a known token and replaces everything else", () => {
    expect(logMethod("CONNECT")).toBe("CONNECT");
    expect(logMethod("DELETE")).toBe("DELETE");
    expect(logMethod("get")).toBe("-");
    expect(logMethod("GET TCP_TUNNEL/200 0 evil.example:443")).toBe("-");
  });
});
