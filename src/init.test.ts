import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "./args";
import { runInit } from "./init";

const KEY = "sk-init-test";

const server = Bun.serve({
  port: 0,
  fetch(req) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${KEY}`) return new Response("{}", { status: 401 });
    return Response.json({
      data: [
        { id: "claude-opus-5" },
        { id: "deepseek-v4-pro" },
        { id: "gpt-5.5" },
      ],
    });
  },
});

afterAll(() => server.stop());

const baseUrl = `http://127.0.0.1:${server.port}`;

function setup(): { home: string; lines: string[]; log: (line: string) => void } {
  const home = mkdtempSync(join(tmpdir(), "apiflux-cli-init-"));
  mkdirSync(join(home, ".claude"));
  mkdirSync(join(home, ".codex"));
  const lines: string[] = [];
  return { home, lines, log: (line) => lines.push(line) };
}

function initArgs(extra: string[] = [], key = KEY) {
  return parseArgs([
    "init",
    "--key",
    key,
    "--base-url",
    baseUrl,
    "--tool",
    "claude-code",
    "--tool",
    "codex",
    "--yes",
    ...extra,
  ]);
}

describe("runInit end-to-end", () => {
  test("valid key: writes both configs and prints success with model count", async () => {
    const { home, lines, log } = setup();
    const code = await runInit(initArgs(), { home, log });
    expect(code).toBe(0);
    const settings = JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf8"));
    expect(settings.env.ANTHROPIC_BASE_URL).toBe(baseUrl);
    expect(settings.env.ANTHROPIC_AUTH_TOKEN).toBe(KEY);
    expect(readFileSync(join(home, ".codex", "config.toml"), "utf8")).toContain("apiflux");
    expect(lines.join("\n")).toContain("3 model");
  });

  test("invalid key: configs written, exit non-zero, key never printed", async () => {
    const { home, lines, log } = setup();
    const code = await runInit(initArgs([], "sk-wrong-key"), { home, log });
    expect(code).not.toBe(0);
    const text = lines.join("\n");
    expect(text.toLowerCase()).toContain("invalid");
    expect(text).not.toContain("sk-wrong-key");
  });

  test("unreachable base URL: reports written-but-unverified", async () => {
    const { home, lines, log } = setup();
    const args = { ...initArgs(), baseUrl: "http://127.0.0.1:1" };
    const code = await runInit(args, { home, log });
    expect(code).not.toBe(0);
    expect(lines.join("\n").toLowerCase()).toContain("unverified");
  });

  test("--skip-verify: exit 0 without contacting server", async () => {
    const { home, lines, log } = setup();
    const args = { ...initArgs(["--skip-verify"]), baseUrl: "http://127.0.0.1:1" };
    const code = await runInit(args, { home, log });
    expect(code).toBe(0);
  });

  test("inline --key prints shell-history warning", async () => {
    const { home, lines, log } = setup();
    await runInit(initArgs(), { home, log, keyWasInline: true });
    expect(lines.join("\n")).toContain("history");
  });

  test("--tool not installed → clear error", async () => {
    const home = mkdtempSync(join(tmpdir(), "apiflux-cli-empty-"));
    const lines: string[] = [];
    const args = initArgs();
    const code = await runInit(args, { home, log: (l) => lines.push(l) });
    expect(code).not.toBe(0);
    expect(lines.join("\n").toLowerCase()).toContain("not detected");
  });
});

describe("model selection", () => {
  function claudeEnv(home: string): Record<string, string> {
    return JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf8")).env;
  }

  test("--model with a non-Claude model pins main and small-fast env vars", async () => {
    const { home, log } = setup();
    const code = await runInit(initArgs(["--model", "deepseek-v4-pro"]), { home, log });
    expect(code).toBe(0);
    const env = claudeEnv(home);
    expect(env.ANTHROPIC_MODEL).toBe("deepseek-v4-pro");
    expect(env.ANTHROPIC_SMALL_FAST_MODEL).toBe("deepseek-v4-pro");
    const codex = readFileSync(join(home, ".codex", "config.toml"), "utf8");
    expect(codex).toContain('model = "deepseek-v4-pro"');
    expect(codex).toContain('model_provider = "apiflux"');
  });

  test("--model with a Claude model sets only the main model", async () => {
    const { home, log } = setup();
    const code = await runInit(initArgs(["--model", "claude-opus-5"]), { home, log });
    expect(code).toBe(0);
    const env = claudeEnv(home);
    expect(env.ANTHROPIC_MODEL).toBe("claude-opus-5");
    expect(env.ANTHROPIC_SMALL_FAST_MODEL).toBeUndefined();
  });

  test("--model not offered by the key fails before writing any config", async () => {
    const { home, lines, log } = setup();
    const code = await runInit(initArgs(["--model", "no-such-model"]), { home, log });
    expect(code).not.toBe(0);
    expect(lines.join("\n").toLowerCase()).toContain("not available");
    expect(existsSync(join(home, ".claude", "settings.json"))).toBe(false);
  });

  test("no model chosen leaves model env vars untouched", async () => {
    const { home, log } = setup();
    await runInit(initArgs(), { home, log });
    const env = claudeEnv(home);
    expect(env.ANTHROPIC_MODEL).toBeUndefined();
    expect(env.ANTHROPIC_SMALL_FAST_MODEL).toBeUndefined();
  });

  test("interactive picker receives maker groups and its choice is applied", async () => {
    const { home, log } = setup();
    let seen: { label: string; models: string[] }[] = [];
    const code = await runInit(initArgs(), {
      home,
      log,
      selectModel: async (groups) => {
        seen = groups;
        return "deepseek-v4-pro";
      },
    });
    expect(code).toBe(0);
    expect(seen.map((group) => group.label)).toEqual(["Anthropic", "OpenAI", "DeepSeek"]);
    expect(seen.find((group) => group.label === "DeepSeek")?.models).toEqual(["deepseek-v4-pro"]);
    expect(claudeEnv(home).ANTHROPIC_MODEL).toBe("deepseek-v4-pro");
  });

  test("picker returning undefined skips model configuration", async () => {
    const { home, log } = setup();
    const code = await runInit(initArgs(), { home, log, selectModel: async () => undefined });
    expect(code).toBe(0);
    expect(claudeEnv(home).ANTHROPIC_MODEL).toBeUndefined();
  });

  test("--skip-verify accepts --model without validation", async () => {
    const { home, log } = setup();
    const args = { ...initArgs(["--model", "kimi-k2.6", "--skip-verify"]), baseUrl: "http://127.0.0.1:1" };
    const code = await runInit(args, { home, log });
    expect(code).toBe(0);
    expect(claudeEnv(home).ANTHROPIC_MODEL).toBe("kimi-k2.6");
  });

  test("unreachable server: --model written unvalidated, run stays unverified", async () => {
    const { home, lines, log } = setup();
    const args = { ...initArgs(["--model", "kimi-k2.6"]), baseUrl: "http://127.0.0.1:1" };
    const code = await runInit(args, { home, log });
    expect(code).not.toBe(0);
    expect(lines.join("\n").toLowerCase()).toContain("unverified");
    expect(claudeEnv(home).ANTHROPIC_MODEL).toBe("kimi-k2.6");
  });
});

describe("gemini-cli tool", () => {
  test("init writes ~/.gemini/.env with base URL, key and chosen model", async () => {
    const { home, lines, log } = setup();
    mkdirSync(join(home, ".gemini"));
    const args = parseArgs([
      "init", "--key", KEY, "--base-url", baseUrl,
      "--tool", "gemini-cli", "--model", "deepseek-v4-pro", "--yes",
    ]);
    const code = await runInit(args, { home, log });
    expect(code).toBe(0);
    const env = readFileSync(join(home, ".gemini", ".env"), "utf8");
    expect(env).toContain(`GOOGLE_GEMINI_BASE_URL="${baseUrl}"`);
    expect(env).toContain(`GEMINI_API_KEY="${KEY}"`);
    expect(env).toContain('GEMINI_MODEL="deepseek-v4-pro"');
    expect(lines.join("\n")).toContain("Gemini CLI: wrote");
  });
});
