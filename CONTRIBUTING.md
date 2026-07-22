# Contributing to apiflux-cli

Thanks for your interest in improving apiflux-cli!

## Scope

Before proposing a feature, please check it fits the project's scope:

- **ApiFlux only.** This is the official onboarding CLI for
  [ApiFlux](https://apiflux.ai). We don't accept presets or provider
  entries for other API vendors — the mechanism is neutral (`--base-url`
  points anywhere), but the roadmap is not. If you use another provider,
  `--base-url` already covers you.
- **New tool adapters are welcome.** Support for additional AI coding
  tools (the things being *configured*, not the API being pointed at)
  fits squarely in scope.
- **Key-only, never your account.** The CLI holds only the API key you
  give it and will not gain login flows or account-level features — see
  [ADR-0001](./docs/adr/0001-key-only-no-account-session.md). Features
  that need more than an API key's permissions belong in the console.

## Development setup

Requirements: [Bun](https://bun.sh) ≥ 1.1 (build/test toolchain) and Node.js ≥ 18 (runtime target).

```bash
bun install
bun test          # unit tests
bun run build     # bundles src/main.ts to dist/apiflux.js
node dist/apiflux.js init --skip-verify   # try it locally
```

## Project layout

- `src/main.ts` — entry point and command dispatch
- `src/adapters/` — one adapter per target tool (Claude Code, Codex CLI, generic export); add new tool support here
- `src/verify.ts` — key verification request
- `scoped/` — thin `@apiflux/cli` alias package that forwards to `apiflux-cli`

## Guidelines

- Every change needs tests (`*.test.ts` next to the source file).
- API keys must never appear in logs, error messages, or written files beyond the intended config entry — mask as `sk-***` (see `src/mask.ts`).
- Config writes must back up the existing file and stay idempotent on re-run.
- Keep dependencies minimal; prefer zero-dependency solutions.

## Submitting changes

1. Fork and create a feature branch.
2. Make your change with tests; run `bun test`.
3. Open a pull request describing the motivation (Conventional Commits for the title, e.g. `feat: add Gemini CLI adapter`).

## Reporting issues

Please include your OS, Node version, the command you ran, and its full (key-masked) output.
