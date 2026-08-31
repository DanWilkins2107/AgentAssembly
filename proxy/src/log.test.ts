import { describe, expect, it } from "vitest";
import { logLine, type Entry } from "./log.js";

// The shape terraform/modules/vm/tests/squid-access-log.sh greps for.
const SIX_FIELDS = /^[0-9]+\.[0-9]{3} \S+ \S+ [A-Z_]+\/[0-9]{3} [0-9]+ \S+\n$/;

const entry = (over: Partial<Entry> = {}): Entry => ({
  at: 1_764_000_123_045,
  session: "sess-1",
  method: "CONNECT",
  status: 200,
  bytes: 4096,
  host: "example.com",
  port: 443,
  ...over,
});

describe("logLine", () => {
  it("writes the six audit fields in squid's order", () => {
    expect(logLine(entry())).toBe(
      "1764000123.045 sess-1 CONNECT TCP_TUNNEL/200 4096 example.com:443\n",
    );
  });

  it("pads the milliseconds and the status to a fixed width", () => {
    expect(logLine(entry({ at: 1_764_000_123_000 }))).toContain(
      "1764000123.000 ",
    );
    expect(logLine(entry({ at: 1_764_000_123_007 }))).toContain(
      "1764000123.007 ",
    );
    expect(logLine(entry({ status: 99 }))).toContain("TCP_DENIED/099 ");
  });

  it("names the result the way the old logformat did", () => {
    expect(logLine(entry({ status: 200 }))).toContain("TCP_TUNNEL/200");
    expect(logLine(entry({ status: 502 }))).toContain("TCP_MISS/502");
    for (const status of [400, 403, 405, 407]) {
      expect(logLine(entry({ status }))).toContain(`TCP_DENIED/${status}`);
    }
  });

  it("writes `-` where the session or the destination is unknown", () => {
    const line = logLine(
      entry({ session: undefined, host: undefined, port: undefined }),
    );

    expect(line).toBe("1764000123.045 - CONNECT TCP_TUNNEL/200 4096 -\n");
    expect(logLine(entry({ host: "example.com", port: undefined }))).toContain(
      " -\n",
    );
    expect(logLine(entry({ host: undefined, port: 443 }))).toContain(" -\n");
  });

  it("drops a session id that could split the line", () => {
    for (const session of ["", "a b", "a\nb", "a:b", "sess/1", "-"]) {
      expect(logLine(entry({ session }))).toMatch(SIX_FIELDS);
      expect(logLine(entry({ session }))).toContain(" - CONNECT ");
    }

    expect(logLine(entry({ session: "sess-ok_1" }))).toContain(" sess-ok_1 ");
  });

  it("drops a method that is not a known token", () => {
    const line = logLine(
      entry({
        method: "GET TCP_TUNNEL/200 0 evil.example:443\n1764000000.000",
      }),
    );

    expect(line).toMatch(SIX_FIELDS);
    expect(line).toContain(" - TCP_TUNNEL/200 ");
  });
});
