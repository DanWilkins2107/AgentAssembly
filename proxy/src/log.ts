// The six-field access line, unchanged from the squid `audit` logformat it
// replaces: unix ts, session, method, result/status, bytes to client, host:port.
// terraform/modules/vm/tests/squid-access-log.sh greps this exact shape.
//
// Nothing a client sends is interpolated. The method is a fixed token or `-`,
// the destination is rebuilt from an already-validated host and a number, and
// the session is dropped unless it matches the id charset. A request byte
// cannot field-split a line or add one.

import { logMethod } from "./head.js";

const SESSION = /^[A-Za-z0-9_-]+$/;
const MILLIS = 1000;
const UNKNOWN = "-";

function result(status: number): string {
  if (status === 200) return "TCP_TUNNEL";
  if (status === 502) return "TCP_MISS";
  return "TCP_DENIED";
}

export type Entry = {
  at: number;
  session: string | undefined;
  method: string;
  status: number;
  bytes: number;
  host: string | undefined;
  port: number | undefined;
};

export function logLine(entry: Entry): string {
  const seconds = Math.floor(entry.at / MILLIS);
  const millis = String(entry.at % MILLIS).padStart(3, "0");
  const session =
    entry.session !== undefined && SESSION.test(entry.session)
      ? entry.session
      : UNKNOWN;
  const dest =
    entry.host !== undefined && entry.port !== undefined
      ? `${entry.host}:${entry.port}`
      : UNKNOWN;
  const status = String(entry.status).padStart(3, "0");
  const fields = [
    `${seconds}.${millis}`,
    session,
    logMethod(entry.method),
    `${result(entry.status)}/${status}`,
    entry.bytes,
    dest,
  ];
  return `${fields.join(" ")}\n`;
}
