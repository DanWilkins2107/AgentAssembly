// The single hook the proxy core consults before it opens any outbound socket.
// Core knows nothing about credentials or allowlists: it hands over a cleanly
// parsed host/port plus the raw Proxy-Authorization value and does what it is
// told. The default answer is deny, so the core on its own tunnels nothing.

export type Decision =
  | { allow: true; session?: string | undefined }
  | { allow: false; status: number; session?: string | undefined };

export type Policy = (
  host: string,
  port: number,
  proxyAuthorization: string | undefined,
) => Decision;

export const denyAll: Policy = () => ({ allow: false, status: 403 });
