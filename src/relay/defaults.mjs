// No operated hosted service is supplied. Both origins must come from the
// operator's flags, environment or existing hosted configuration. In a shell,
// use `env 0X2F_RELAY_URL=... 0X2F_CLIENT_ORIGIN=... 2f pair`: the legacy
// variable names start with a digit and cannot be assigned with `export`.
// Plain `2f pair` remains LAN-first.
export function defaultRelayUrl() {
  return (process.env["0X2F_RELAY_URL"] ?? "").trim();
}

export function defaultClientOrigin() {
  return (process.env["0X2F_CLIENT_ORIGIN"] ?? "").trim();
}
