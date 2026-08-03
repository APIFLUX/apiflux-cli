import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openclawAdapter } from "./openclaw";

const BASE_URL = "https://apiflux.ai";
const KEY = "sk-test1234";
const MODELS = ["deepseek-v4-pro", "kimi-k2.6", "claude-sonnet-5"];

function tempHome(): string {
  return mkdtempSync(join(tmpdir(), "apiflux-cli-openclaw-"));
}

function configPath(home: string): string {
  return join(home, ".openclaw", "openclaw.json");
}

function readJson(home: string): any {
  return JSON.parse(readFileSync(configPath(home), "utf8"));
}

// OpenClaw honors OPENCLAW_STATE_DIR / OPENCLAW_CONFIG_PATH (src/config/paths.ts);
// pin them to unset so paths derive from the temp home.
let savedStateDir: string | undefined;
let savedConfigPath: string | undefined;
beforeEach(() => {
  savedStateDir = process.env.OPENCLAW_STATE_DIR;
  savedConfigPath = process.env.OPENCLAW_CONFIG_PATH;
  delete process.env.OPENCLAW_STATE_DIR;
  delete process.env.OPENCLAW_CONFIG_PATH;
});
afterEach(() => {
  if (savedStateDir === undefined) delete process.env.OPENCLAW_STATE_DIR;
  else process.env.OPENCLAW_STATE_DIR = savedStateDir;
  if (savedConfigPath === undefined) delete process.env.OPENCLAW_CONFIG_PATH;
  else process.env.OPENCLAW_CONFIG_PATH = savedConfigPath;
});

describe("openclawAdapter.detect", () => {
  test("false without ~/.openclaw, true with it", () => {
    const home = tempHome();
    expect(openclawAdapter.detect(home)).toBe(false);
    mkdirSync(join(home, ".openclaw"));
    expect(openclawAdapter.detect(home)).toBe(true);
  });

  test("honors OPENCLAW_STATE_DIR override", () => {
    const home = tempHome();
    process.env.OPENCLAW_STATE_DIR = join(home, "custom-state");
    expect(openclawAdapter.detect(home)).toBe(false);
    mkdirSync(join(home, "custom-state"), { recursive: true });
    expect(openclawAdapter.detect(home)).toBe(true);
  });
});

describe("openclawAdapter.write", () => {
  test("writes provider with minimal model entries and literal apiKey", () => {
    const home = tempHome();
    const notes = openclawAdapter.write(home, { baseUrl: BASE_URL, key: KEY, availableModels: MODELS });
    const config = readJson(home);
    const provider = config.models.providers.apiflux;
    expect(provider.baseUrl).toBe(`${BASE_URL}/v1`);
    expect(provider.apiKey).toBe(KEY);
    expect(provider.api).toBe("openai-completions");
    // Official docs' minimal shape: {id, name}; runtime fills the rest.
    expect(provider.models.map((m: any) => m.id).sort()).toEqual([...MODELS].sort());
    for (const model of provider.models) expect(model.name).toBe(model.id);
    // models.mode must not be introduced (default is already merge).
    expect(config.models.mode).toBeUndefined();
    expect(notes.join("\n")).toContain(configPath(home));
  });

  test("known models carry contextWindow/maxTokens/reasoning; unknown ids stay minimal", () => {
    const home = tempHome();
    openclawAdapter.write(home, {
      baseUrl: BASE_URL,
      key: KEY,
      availableModels: ["gpt-4o", "deepseek-v4-pro", "totally-new-model"],
    });
    const models = readJson(home).models.providers.apiflux.models;
    const byId = Object.fromEntries(models.map((m: any) => [m.id, m]));
    // provider-model-helpers.ts otherwise fills a generic default context window.
    expect(byId["gpt-4o"]).toEqual({
      id: "gpt-4o",
      name: "gpt-4o",
      reasoning: false,
      contextWindow: 128_000,
      maxTokens: 16_384,
    });
    expect(byId["deepseek-v4-pro"].reasoning).toBe(true);
    expect(byId["totally-new-model"]).toEqual({ id: "totally-new-model", name: "totally-new-model" });
  });

  test("chosen model sets agents.defaults.model.primary", () => {
    const home = tempHome();
    openclawAdapter.write(home, {
      baseUrl: BASE_URL,
      key: KEY,
      model: "deepseek-v4-pro",
      availableModels: MODELS,
    });
    expect(readJson(home).agents.defaults.model.primary).toBe("apiflux/deepseek-v4-pro");
  });

  test("keeps existing fallbacks when updating primary", () => {
    const home = tempHome();
    mkdirSync(join(home, ".openclaw"), { recursive: true });
    writeFileSync(
      configPath(home),
      JSON.stringify({
        agents: { defaults: { model: { primary: "anthropic/claude-sonnet-5", fallbacks: ["openai/gpt-5.5"] } } },
      }),
    );
    openclawAdapter.write(home, { baseUrl: BASE_URL, key: KEY, model: "kimi-k2.6", availableModels: MODELS });
    const model = readJson(home).agents.defaults.model;
    expect(model.primary).toBe("apiflux/kimi-k2.6");
    expect(model.fallbacks).toEqual(["openai/gpt-5.5"]);
  });

  test("no chosen model leaves agents.defaults untouched", () => {
    const home = tempHome();
    mkdirSync(join(home, ".openclaw"), { recursive: true });
    writeFileSync(configPath(home), JSON.stringify({ agents: { defaults: { model: { primary: "a/b" } } } }));
    openclawAdapter.write(home, { baseUrl: BASE_URL, key: KEY, availableModels: MODELS });
    expect(readJson(home).agents.defaults.model.primary).toBe("a/b");
  });

  test("preserves other providers, models.mode, and unrelated keys; parses JSON5", () => {
    const home = tempHome();
    mkdirSync(join(home, ".openclaw"), { recursive: true });
    writeFileSync(
      configPath(home),
      `{
        // my config
        gateway: { port: 18789 },
        models: {
          mode: "replace",
          providers: {
            moonshot: { baseUrl: "https://api.moonshot.ai/v1", apiKey: "sk-moon", api: "openai-completions", models: [] },
          },
        },
      }`,
    );
    openclawAdapter.write(home, { baseUrl: BASE_URL, key: KEY, availableModels: MODELS });
    const config = readJson(home);
    expect(config.gateway.port).toBe(18789);
    expect(config.models.mode).toBe("replace");
    expect(config.models.providers.moonshot.apiKey).toBe("sk-moon");
    expect(config.models.providers.apiflux.baseUrl).toBe(`${BASE_URL}/v1`);
  });

  test("backs up existing config once and is idempotent", () => {
    const home = tempHome();
    mkdirSync(join(home, ".openclaw"), { recursive: true });
    writeFileSync(configPath(home), JSON.stringify({ gateway: { port: 1 } }));
    openclawAdapter.write(home, { baseUrl: BASE_URL, key: KEY, availableModels: MODELS });
    const first = readFileSync(configPath(home), "utf8");
    openclawAdapter.write(home, { baseUrl: BASE_URL, key: KEY, availableModels: MODELS });
    expect(readFileSync(configPath(home), "utf8")).toBe(first);
    const backups = readdirSync(join(home, ".openclaw")).filter((f) => f.startsWith("openclaw.json.bak."));
    expect(backups.length).toBe(1);
  });

  test("config with $include is left untouched with manual instructions", () => {
    const home = tempHome();
    mkdirSync(join(home, ".openclaw"), { recursive: true });
    const original = `{ "$include": "./base.json5", "gateway": { "port": 1 } }`;
    writeFileSync(configPath(home), original);
    const notes = openclawAdapter.write(home, { baseUrl: BASE_URL, key: KEY, availableModels: MODELS });
    expect(readFileSync(configPath(home), "utf8")).toBe(original);
    expect(notes.join("\n")).toContain("apiflux");
  });
});

describe("openclawAdapter.plan", () => {
  test("no config → no conflicts", () => {
    expect(openclawAdapter.plan(tempHome(), { baseUrl: BASE_URL, key: KEY }).conflicts).toEqual([]);
  });

  test("existing apiflux provider with different baseUrl → conflict", () => {
    const home = tempHome();
    mkdirSync(join(home, ".openclaw"), { recursive: true });
    writeFileSync(
      configPath(home),
      JSON.stringify({ models: { providers: { apiflux: { baseUrl: "https://old.example.com/v1", models: [] } } } }),
    );
    const { conflicts } = openclawAdapter.plan(home, { baseUrl: BASE_URL, key: KEY });
    expect(conflicts.length).toBe(1);
    expect(conflicts[0]).toContain("https://old.example.com/v1");
  });

  test("existing different apiKey → conflict without echoing key material", () => {
    const home = tempHome();
    mkdirSync(join(home, ".openclaw"), { recursive: true });
    writeFileSync(
      configPath(home),
      JSON.stringify({
        models: { providers: { apiflux: { baseUrl: `${BASE_URL}/v1`, apiKey: "sk-old-secret", models: [] } } },
      }),
    );
    const { conflicts } = openclawAdapter.plan(home, { baseUrl: BASE_URL, key: KEY });
    expect(conflicts.length).toBe(1);
    expect(conflicts[0]).not.toContain("sk-old-secret");
    expect(conflicts[0]).toContain("sk-***");
  });

  test("existing different primary → conflict when a model is chosen", () => {
    const home = tempHome();
    mkdirSync(join(home, ".openclaw"), { recursive: true });
    writeFileSync(
      configPath(home),
      JSON.stringify({ agents: { defaults: { model: { primary: "anthropic/claude-sonnet-5" } } } }),
    );
    const { conflicts } = openclawAdapter.plan(home, { baseUrl: BASE_URL, key: KEY, model: "deepseek-v4-pro" });
    expect(conflicts.some((line) => line.includes("anthropic/claude-sonnet-5"))).toBe(true);
  });

  test("comments in config → warning that they will be stripped (matching official behavior)", () => {
    const home = tempHome();
    mkdirSync(join(home, ".openclaw"), { recursive: true });
    writeFileSync(configPath(home), `{\n  // tuned by hand\n  gateway: { port: 1 },\n}`);
    const { conflicts } = openclawAdapter.plan(home, { baseUrl: BASE_URL, key: KEY });
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].toLowerCase()).toContain("comment");
  });

  test("comment-looking slashes inside strings are not flagged", () => {
    const home = tempHome();
    mkdirSync(join(home, ".openclaw"), { recursive: true });
    writeFileSync(
      configPath(home),
      JSON.stringify({ models: { providers: { x: { baseUrl: "https://a//b/*c", models: [] } } } }),
    );
    expect(openclawAdapter.plan(home, { baseUrl: BASE_URL, key: KEY }).conflicts).toEqual([]);
  });

  test("$include config → conflict announcing manual merge", () => {
    const home = tempHome();
    mkdirSync(join(home, ".openclaw"), { recursive: true });
    writeFileSync(configPath(home), `{ "$include": "./base.json5" }`);
    const { conflicts } = openclawAdapter.plan(home, { baseUrl: BASE_URL, key: KEY });
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].toLowerCase()).toContain("manual");
  });
});
