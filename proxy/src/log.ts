// Nothing a client sends is interpolated: the method is a fixed token or `-`,
// the host is rebuilt from an already-validated parse, and a session id outside
// the id charset is dropped. A request byte cannot split a field or add a line.

import { logMethod } from "./head.js";

const SESSION = /^[A-Za-z0-9_-]+$/;
const MILLIS = 1000;

export const UNKNOWN = "-";

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
};

export function logLine(entry: Entry): string {
  const seconds = Math.floor(entry.at / MILLIS);
  const millis = String(entry.at % MILLIS).padStart(3, "0");
  const session =
    entry.session !== undefined && SESSION.test(entry.session)
      ? entry.session
      : UNKNOWN;
  const fields = [
    `${seconds}.${millis}`,
    session,
    logMethod(entry.method),
    `${result(entry.status)}/${String(entry.status).padStart(3, "0")}`,
    entry.bytes,
    entry.host ?? UNKNOWN,
  ];
  return `${fields.join(" ")}\n`;
}
