# Contributing to apiflux-cli

Thanks for your interest in improving apiflux-cli!

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
