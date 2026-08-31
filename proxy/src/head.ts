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

function splitAtColon(
  text: string,
  colon: number,
): { left: string; right: string } | null {
  if (colon === -1) return null;
  return {
    left: text.slice(0, colon).toLowerCase(),
    right: text.slice(colon + 1),
  };
}

function validHost(host: string): boolean {
  return host.length <= MAX_HOST_LENGTH && HOST.test(host);
}

function validPort(port: string): boolean {
  return PORT.test(port) && Number(port) <= MAX_PORT;
}

function target(text: string): { host: string; port: number } | null {
  const split = splitAtColon(text, text.lastIndexOf(":"));
  if (split === null) return null;
  const { left: host, right: port } = split;
  if (!validHost(host) || !validPort(port)) return null;
  return { host, port: Number(port) };
}

type Field = { name: string; value: string };

function fields(lines: string[]): Field[] | null {
  const parsed: Field[] = [];
  for (const line of lines) {
    const split = splitAtColon(line, line.indexOf(":"));
    // Also rejects obs-fold continuations, whose name would start with a space.
    if (split === null || !FIELD_NAME.test(split.left)) return null;
    parsed.push({ name: split.left, value: split.right.trim() });
  }
  return parsed;
}

// Only Proxy-Authorization is kept; nothing else in the headers is ever read. A
// repeat of it is refused rather than resolved, so the policy hook can never be
// shown a different credential from the one a reader of the request would see.
function proxyAuthorization(lines: string[]): string | null | undefined {
  const parsed = fields(lines);
  if (parsed === null) return null;
  const values = parsed
    .filter((field) => field.name === "proxy-authorization")
    .map((field) => field.value);
  if (values.length > 1) return null;
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
