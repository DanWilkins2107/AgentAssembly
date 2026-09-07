// The only parse in the proxy. Everything after the 200 is a raw byte copy, so
// this is the whole request-handling attack surface: it either yields a clean
// host/port or a refusal status, and never hands a half-trusted string on.

export const MAX_HEAD_BYTES = 8192;

const VERSION = /^HTTP\/1\.[01]$/;
// No leading zeros: the port must read the same as the number it becomes.
const PORT = /^[1-9][0-9]{0,4}$/;
const MAX_PORT = 65535;
// LDH labels only. Rejects bracketed IP literals, userinfo, trailing dots,
// empty labels, underscores and every non-ASCII byte.
const HOST =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;
const MAX_HOST_LENGTH = 253;
const FIELD_NAME = /^[!#$%&'*+\-.^_`|~0-9a-z]+$/;
const PROXY_AUTH = "proxy-authorization";

const DEL = 0x7f;
const FIRST_PRINTABLE = 0x20;

function hasControl(value: string): boolean {
  return [...value].some((char) => {
    const code = char.charCodeAt(0);
    return code < FIRST_PRINTABLE || code === DEL;
  });
}

// The log's method field comes from this set or is `-`, so no byte a client
// chooses can reach the log through it.
const METHODS = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "DELETE",
  "CONNECT",
  "OPTIONS",
  "TRACE",
  "PATCH",
]);

export function logMethod(token: string): string {
  return METHODS.has(token) ? token : "-";
}

export type Head = {
  host: string;
  port: number;
  proxyAuthorization: string | undefined;
};

export type ParseResult =
  | { ok: true; method: string; head: Head }
  | { ok: false; method: string; status: 400 | 405 };

type Split = { left: string; right: string };

// The one colon split in the parser: the left side is lowercased, and the two
// halves only come back together if the caller's rule accepts both.
function splitAtColon(
  text: string,
  colon: number,
  valid: (left: string, right: string) => boolean,
): Split | null {
  if (colon === -1) return null;
  const left = text.slice(0, colon).toLowerCase();
  const right = text.slice(colon + 1);
  return valid(left, right) ? { left, right } : null;
}

function validHost(host: string): boolean {
  return host.length <= MAX_HOST_LENGTH && HOST.test(host);
}

function validPort(port: string): boolean {
  return PORT.test(port) && Number(port) <= MAX_PORT;
}

function target(text: string): { host: string; port: number } | null {
  const split = splitAtColon(
    text,
    text.lastIndexOf(":"),
    (host, port) => validHost(host) && validPort(port),
  );
  return split === null
    ? null
    : { host: split.left, port: Number(split.right) };
}

// Every header line must be well formed, but only Proxy-Authorization is kept;
// nothing else in the headers is ever read.
function credentials(lines: string[]): string[] | null {
  const values: string[] = [];
  for (const line of lines) {
    // The name rule also rejects obs-fold continuations, whose name would
    // start with a space.
    const split = splitAtColon(line, line.indexOf(":"), (name) =>
      FIELD_NAME.test(name),
    );
    if (split === null) return null;
    if (split.left === PROXY_AUTH) values.push(split.right.trim());
  }
  return values;
}

// A repeat is refused rather than resolved, so the policy hook can never be
// shown a different credential from the one a reader of the request would see.
function proxyAuthorization(lines: string[]): string | null | undefined {
  const values = credentials(lines);
  if (values === null || values.length > 1) return null;
  const [value] = values;
  if (value === undefined) return undefined;
  return hasControl(value) ? null : value;
}

function splitRequestLine(line: string): {
  method: string;
  destination: string | null;
} {
  const parts = line.split(" ") as [string, ...string[]];
  const method = logMethod(parts[0]);
  if (parts.length !== 3) return { method, destination: null };
  const [, destination, version] = parts as [string, string, string];
  return { method, destination: VERSION.test(version) ? destination : null };
}

export function parseHead(text: string): ParseResult {
  // split always yields at least one element, and splitRequestLine's length
  // check is what makes the request line a three-tuple.
  const [requestLine, ...headers] = text.split("\r\n") as [string, ...string[]];
  const { method, destination } = splitRequestLine(requestLine);
  if (destination === null) return { ok: false, method, status: 400 };
  // logMethod has already mapped anything but a known token to `-`.
  if (method !== "CONNECT") return { ok: false, method, status: 405 };

  const dest = target(destination);
  if (dest === null) return { ok: false, method, status: 400 };

  const auth = proxyAuthorization(headers);
  if (auth === null) return { ok: false, method, status: 400 };

  return { ok: true, method, head: { ...dest, proxyAuthorization: auth } };
}
