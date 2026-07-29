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

describe("opencode wiring", () => {
  test("--tool opencode registers all verified models and stores the key in auth.json", async () => {
    const savedConfigHome = process.env.XDG_CONFIG_HOME;
    const savedDataHome = process.env.XDG_DATA_HOME;
    delete process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_DATA_HOME;
    try {
      const { home, log } = setup();
      mkdirSync(join(home, ".config", "opencode"), { recursive: true });
      const args = parseArgs(["init", "--key", KEY, "--base-url", baseUrl, "--tool", "opencode", "--yes"]);
      const code = await runInit(args, { home, log });
      expect(code).toBe(0);
      const config = JSON.parse(
        readFileSync(join(home, ".config", "opencode", "opencode.json"), "utf8"),
      );
      expect(Object.keys(config.provider.apiflux.models).sort()).toEqual([
        "claude-opus-5",
        "deepseek-v4-pro",
        "gpt-5.5",
      ]);
      const auth = JSON.parse(
        readFileSync(join(home, ".local", "share", "opencode", "auth.json"), "utf8"),
      );
      expect(auth.apiflux).toEqual({ type: "api", key: KEY });
    } finally {
      if (savedConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = savedConfigHome;
      if (savedDataHome === undefined) delete process.env.XDG_DATA_HOME;
      else process.env.XDG_DATA_HOME = savedDataHome;
    }
  });
});

describe("pi wiring", () => {
  test("--tool pi registers all verified models and stores the key in auth.json", async () => {
    const savedAgentDir = process.env.PI_CODING_AGENT_DIR;
    delete process.env.PI_CODING_AGENT_DIR;
    try {
      const { home, log } = setup();
      mkdirSync(join(home, ".pi"));
      const args = parseArgs(["init", "--key", KEY, "--base-url", baseUrl, "--tool", "pi", "--yes"]);
      const code = await runInit(args, { home, log });
      expect(code).toBe(0);
      const models = JSON.parse(readFileSync(join(home, ".pi", "agent", "models.json"), "utf8"));
      expect(models.providers.apiflux.models.map((m: any) => m.id).sort()).toEqual([
        "claude-opus-5",
        "deepseek-v4-pro",
        "gpt-5.5",
      ]);
      const auth = JSON.parse(readFileSync(join(home, ".pi", "agent", "auth.json"), "utf8"));
      expect(auth.apiflux).toEqual({ type: "api_key", key: KEY });
    } finally {
      if (savedAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = savedAgentDir;
    }
  });
});

describe("hermes wiring", () => {
  test("--tool hermes registers custom provider and stores the key in .env", async () => {
    const savedHermesHome = process.env.HERMES_HOME;
    delete process.env.HERMES_HOME;
    try {
      const { home, log } = setup();
      mkdirSync(join(home, ".hermes"));
      const args = parseArgs(["init", "--key", KEY, "--base-url", baseUrl, "--tool", "hermes", "--yes"]);
      const code = await runInit(args, { home, log });
      expect(code).toBe(0);
      const raw = readFileSync(join(home, ".hermes", "config.yaml"), "utf8");
      expect(raw).toContain("ApiFlux");
      expect(raw).toContain("deepseek-v4-pro");
      expect(raw).not.toContain(KEY);
      expect(readFileSync(join(home, ".hermes", ".env"), "utf8")).toContain(`APIFLUX_API_KEY=${KEY}`);
    } finally {
      if (savedHermesHome === undefined) delete process.env.HERMES_HOME;
      else process.env.HERMES_HOME = savedHermesHome;
    }
  });
});

describe("openclaw wiring", () => {
  test("--tool openclaw registers all verified models with literal apiKey", async () => {
    const savedStateDir = process.env.OPENCLAW_STATE_DIR;
    const savedConfigPath = process.env.OPENCLAW_CONFIG_PATH;
    delete process.env.OPENCLAW_STATE_DIR;
    delete process.env.OPENCLAW_CONFIG_PATH;
    try {
      const { home, log } = setup();
      mkdirSync(join(home, ".openclaw"));
      const args = parseArgs(["init", "--key", KEY, "--base-url", baseUrl, "--tool", "openclaw", "--yes"]);
      const code = await runInit(args, { home, log });
      expect(code).toBe(0);
      const config = JSON.parse(readFileSync(join(home, ".openclaw", "openclaw.json"), "utf8"));
      expect(config.models.providers.apiflux.models.map((m: any) => m.id).sort()).toEqual([
        "claude-opus-5",
        "deepseek-v4-pro",
        "gpt-5.5",
      ]);
      expect(config.models.providers.apiflux.apiKey).toBe(KEY);
    } finally {
      if (savedStateDir === undefined) delete process.env.OPENCLAW_STATE_DIR;
      else process.env.OPENCLAW_STATE_DIR = savedStateDir;
      if (savedConfigPath === undefined) delete process.env.OPENCLAW_CONFIG_PATH;
      else process.env.OPENCLAW_CONFIG_PATH = savedConfigPath;
    }
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
