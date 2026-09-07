/**
 * Every way the session is told to use the proxy, in one place.
 *
 * Both casings, because there is no standard one: libcurl (so curl, and so git's
 * HTTP transport) reads the lowercase names, Go's net/http (so gh) prefers the
 * uppercase, and node's undici — what `fetch` is built on — reads the uppercase.
 * Set one casing and something goes direct.
 *
 * The GIT_CONFIG_* trio is the part that is not redundant with those, and the
 * reason it is here is that git can otherwise turn the proxy off for itself:
 *
 *   - git does honour https_proxy, but only as a fallback. Its own `http.proxy`
 *     config value wins over the environment, and `http.proxy=` (empty) means
 *     "connect direct" rather than "unset".
 *   - the session can write both places that value normally comes from: a
 *     repo-local .git/config inside its own writable workdir, and ~/.gitconfig
 *     in its own writable tmpfs HOME. Either would be enough.
 *
 * GIT_CONFIG_COUNT entries are read at the same precedence as `git -c`, which
 * sits above every config file, so http.proxy set this way cannot be overridden
 * from inside the sandbox.
 *
 * What none of this covers is git over ssh (git@github.com:...), which never
 * consults an HTTP proxy at all. Nothing settable here could; that one is closed
 * by the host firewall, whose output chain drops any egress not from uid 0 or
 * the proxy user.
 */
export function proxyArgs(
  proxy: string,
  noProxy: string | undefined,
): string[] {
  const args = [
    "--setenv",
    "HTTPS_PROXY",
    proxy,
    "--setenv",
    "https_proxy",
    proxy,
    "--setenv",
    "HTTP_PROXY",
    proxy,
    "--setenv",
    "http_proxy",
    proxy,
    "--setenv",
    "GIT_CONFIG_COUNT",
    "1",
    "--setenv",
    "GIT_CONFIG_KEY_0",
    "http.proxy",
    "--setenv",
    "GIT_CONFIG_VALUE_0",
    proxy,
  ];
  // Conditional, because an empty no_proxy is not the same as an absent one:
  // some clients read "" as "exempt nothing", others as a malformed list.
  if (noProxy)
    args.push("--setenv", "NO_PROXY", noProxy, "--setenv", "no_proxy", noProxy);
  return args;
}
