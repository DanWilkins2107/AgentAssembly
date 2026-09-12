import { openAccessLog } from "./access-log.js";
import { denyAll } from "./policy.js";
import { createProxy } from "./proxy.js";

const HOST = "127.0.0.1";
const PORT = 3128;
const LOG_PATH =
  process.env["PROXY_ACCESS_LOG"] ?? "/var/log/agentassembly-proxy/access.log";

const log = openAccessLog(LOG_PATH);
process.on("SIGHUP", log.reopen);

// denyAll until 8111bb4e fills the table: the core on its own tunnels nothing.
createProxy({ policy: denyAll, log: log.write }).listen(PORT, HOST);
