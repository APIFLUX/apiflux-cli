# Key-only credentials: the CLI never touches your account session

Status: accepted (2026-07-22)

apiflux-cli authenticates with exactly one credential: an API key the user
explicitly pastes in (or pipes via `--key -`). We deliberately do **not**
implement a browser-based login flow (deep link, OAuth device flow, or
localhost callback) that would exchange an apiflux.ai account session for a
key, and we will not add features that require account-level permissions.

## Why

- **Blast radius.** An API key is a spend-limited calling credential. An
  account session can change passwords, view billing, and mint or revoke
  keys. A CLI that holds only a key can never leak more than that key — no
  matter what bug, log line, or malicious fork is involved.
- **Auditable trust.** This repo is open source. "Paste a key you created
  yourself" is trivially auditable; "the CLI obtains a session to your
  account" is a much larger claim to verify and a much larger protocol
  surface to keep secure (CSRF, loopback hijacking, token rotation).
- **`--base-url` neutrality.** The CLI works against any compatible
  endpoint. A login flow bound to apiflux.ai would split the code into two
  divergent paths and break for self-hosted users.
- **Published protocol lock-in.** Old npm versions live for a long time in
  `npx` caches. Any auth handshake we ship becomes a public contract we
  cannot change without stranding users.

## Consequences

- Feature rule of thumb: **if an API key's permissions can't do it, the CLI
  doesn't do it.** Diagnostics and model listing are in scope; creating or
  revoking keys, billing, and top-ups are not — the console handles those.
- Account-adjacent features (e.g. balance/usage display) require a
  key-authenticated backend endpoint first; we won't shortcut through
  session-authenticated endpoints.
- If a standard authorization flow (e.g. OAuth Device Authorization Grant)
  is ever warranted, it will be designed from scratch as a new decision
  superseding this one.
