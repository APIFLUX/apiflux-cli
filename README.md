# apiflux-cli

[![npm](https://img.shields.io/npm/v/apiflux-cli)](https://www.npmjs.com/package/apiflux-cli)
[![CI](https://github.com/APIFLUX/apiflux-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/APIFLUX/apiflux-cli/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/apiflux-cli)](./LICENSE)

One-command setup of [ApiFlux](https://apiflux.ai) for your local AI coding tools.

```bash
npx apiflux-cli init
```

Paste your ApiFlux API key when prompted, pick the tools to configure, done. The CLI writes the correct base URL and key into each tool's config, verifies the key with a real request, and tells you exactly what it changed.

## Supported tools

| Tool | What gets configured |
| --- | --- |
| Claude Code | `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` in `~/.claude/settings.json` |
| Codex CLI | `model_providers.apiflux` in `~/.codex/config.toml` (key stays in the `APIFLUX_API_KEY` env var, never in the file); with `--model`, also sets it as the default provider/model |
| Gemini CLI | `GOOGLE_GEMINI_BASE_URL` / `GEMINI_API_KEY` (and `GEMINI_MODEL` if chosen) in `~/.gemini/.env` |
| Anything OpenAI-compatible | Prints `export OPENAI_BASE_URL` / `OPENAI_API_KEY` (and `OPENAI_MODEL` if chosen) lines for your shell or `.env` |

Any model your key can use works in any tool — the ApiFlux gateway converts between the Anthropic, OpenAI, and Gemini protocols. Picking a non-Claude model for Claude Code also pins its small/fast background model so every request stays on your chosen model.

## Usage

```bash
npx apiflux-cli init                      # interactive: hidden key prompt + tool picker
npx apiflux-cli init --key sk-xxx --yes   # non-interactive (as copied from the ApiFlux console)
npx apiflux-cli init --key -              # read the key from stdin
```

| Flag | Meaning |
| --- | --- |
| `--key <key\|->` | API key; `-` reads from stdin; omit for a hidden prompt |
| `--base-url <url>` | Override the API origin (self-hosted / testing) |
| `--tool <id>` | Configure only this tool (repeatable): `claude-code`, `codex`, `gemini-cli`, `export` |
| `--model <id>` | Default model for the configured tools; omit in a terminal to pick from a list, omit in scripts to keep each tool's default |
| `--yes` | Skip confirmations, overwrite conflicting config |
| `--skip-verify` | Don't send the verification request |

## Safety

- Existing config files are backed up (`*.bak.<timestamp>`) before any write; merges preserve your other settings; re-running is idempotent.
- If a different base URL or token is already configured, the CLI asks before replacing it.
- Your key is never written to logs and is masked (`sk-***`) in every error message.
- If you pass `--key` inline, the CLI reminds you to clear it from shell history; prefer the interactive prompt or `--key -`.
- The CLI never touches your ApiFlux account — it only ever holds the API key you give it, by design ([ADR-0001](./docs/adr/0001-key-only-no-account-session.md)).

## Requirements

Node.js ≥ 18. macOS and Linux supported; Windows via WSL.

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE)
