import { closeSync, openSync, writeSync } from "node:fs";

// Append-only, synchronous, one write per line: a refusal is on disk before the
// socket closes, and two connections cannot interleave a line. Reopen is the
// rotate hook - the caller wires it to SIGHUP.
export function openAccessLog(path: string): {
  write: (line: string) => void;
  reopen: () => void;
  close: () => void;
} {
  let fd = openSync(path, "a", 0o640);
  return {
    write: (line) => {
      writeSync(fd, line);
    },
    reopen: () => {
      const previous = fd;
      fd = openSync(path, "a", 0o640);
      closeSync(previous);
    },
    close: () => {
      closeSync(fd);
    },
  };
}
