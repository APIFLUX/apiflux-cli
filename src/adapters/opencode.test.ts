import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { opencodeAdapter } from "./opencode";

const BASE_URL = "https://apiflux.ai";
const KEY = "sk-test1234";
const MODELS = ["deepseek-v4-pro", "kimi-k2.6", "claude-sonnet-5"];

function tempHome(): string {
  return mkdtempSync(join(tmpdir(), "apiflux-cli-opencode-"));
}

function configPath(home: string): string {
  return join(home, ".config", "opencode", "opencode.json");
}

function authPath(home: string): string {
  return join(home, ".local", "share", "opencode", "auth.json");
}

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

// opencode resolves its dirs via xdg-basedir; the adapter must honor the same
// overrides. Tests pin them to unset so paths derive from the temp home.
let savedConfigHome: string | undefined;
let savedDataHome: string | undefined;
beforeEach(() => {
  savedConfigHome = process.env.XDG_CONFIG_HOME;
  savedDataHome = process.env.XDG_DATA_HOME;
  delete process.env.XDG_CONFIG_HOME;
  delete process.env.XDG_DATA_HOME;
});
afterEach(() => {
  if (savedConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = savedConfigHome;
  if (savedDataHome === undefined) delete process.env.XDG_DATA_HOME;
  else process.env.XDG_DATA_HOME = savedDataHome;
});

describe("opencodeAdapter.detect", () => {
  test("false without opencode dirs, true with config dir, true with data dir", () => {
    const home = tempHome();
    expect(opencodeAdapter.detect(home)).toBe(false);
    mkdirSync(join(home, ".config", "opencode"), { recursive: true });
    expect(opencodeAdapter.detect(home)).toBe(true);
    const home2 = tempHome();
    mkdirSync(join(home2, ".local", "share", "opencode"), { recursive: true });
    expect(opencodeAdapter.detect(home2)).toBe(true);
  });

  test("honors XDG_CONFIG_HOME override", () => {
    const home = tempHome();
    process.env.XDG_CONFIG_HOME = join(home, "xdg-config");
    expect(opencodeAdapter.detect(home)).toBe(false);
    mkdirSync(join(home, "xdg-config", "opencode"), { recursive: true });
    expect(opencodeAdapter.detect(home)).toBe(true);
  });
});

describe("opencodeAdapter.write", () => {
  test("writes provider block without key material and auth.json with the key", () => {
    const home = tempHome();
    const notes = opencodeAdapter.write(home, {
      baseUrl: BASE_URL,
      key: KEY,
      availableModels: MODELS,
    });
    const config = readJson(configPath(home));
    expect(config.provider.apiflux.npm).toBe("@ai-sdk/openai-compatible");
    expect(config.provider.apiflux.name).toBe("ApiFlux");
    expect(config.provider.apiflux.options.baseURL).toBe(`${BASE_URL}/v1`);
    // All models the key can use are declared so opencode's /models lists them.
    expect(Object.keys(config.provider.apiflux.models).sort()).toEqual([...MODELS].sort());
    // The key lives only in opencode's native credential store.
    expect(readFileSync(configPath(home), "utf8")).not.toContain(KEY);
    const auth = readJson(authPath(home));
    expect(auth.apiflux).toEqual({ type: "api", key: KEY });
    expect(statSync(authPath(home)).mode & 0o777).toBe(0o600);
    expect(notes.join("\n")).toContain(configPath(home));
  });

  test("known models carry limits and reasoning; unknown ids stay minimal", () => {
    const home = tempHome();
    opencodeAdapter.write(home, {
      baseUrl: BASE_URL,
      key: KEY,
      availableModels: ["gpt-4o", "deepseek-v4-pro", "totally-new-model"],
    });
    const models = readJson(configPath(home)).provider.apiflux.models;
    // Without limit.context opencode assumes a 128K-ish default for every model.
    expect(models["gpt-4o"]).toEqual({
      name: "gpt-4o",
      reasoning: false,
      limit: { context: 128_000, output: 16_384 },
    });
    expect(models["deepseek-v4-pro"].reasoning).toBe(true);
    expect(models["deepseek-v4-pro"].limit.context).toBe(1_000_000);
    expect(models["totally-new-model"]).toEqual({ name: "totally-new-model" });
  });

  test("chosen model sets root model as apiflux/<id>", () => {
    const home = tempHome();
    opencodeAdapter.write(home, {
      baseUrl: BASE_URL,
      key: KEY,
      model: "deepseek-v4-pro",
      availableModels: MODELS,
    });
    expect(readJson(configPath(home)).model).toBe("apiflux/deepseek-v4-pro");
  });

  test("no chosen model leaves existing root model untouched", () => {
    const home = tempHome();
    mkdirSync(join(home, ".config", "opencode"), { recursive: true });
    writeFileSync(configPath(home), JSON.stringify({ model: "anthropic/claude-sonnet-5" }));
    opencodeAdapter.write(home, { baseUrl: BASE_URL, key: KEY, availableModels: MODELS });
    expect(readJson(configPath(home)).model).toBe("anthropic/claude-sonnet-5");
  });

  test("without availableModels falls back to the chosen model only", () => {
    const home = tempHome();
    opencodeAdapter.write(home, { baseUrl: BASE_URL, key: KEY, model: "kimi-k2.6" });
    const config = readJson(configPath(home));
    expect(Object.keys(config.provider.apiflux.models)).toEqual(["kimi-k2.6"]);
  });

  test("preserves other providers, auth entries, and unrelated config keys", () => {
    const home = tempHome();
    mkdirSync(join(home, ".config", "opencode"), { recursive: true });
    mkdirSync(join(home, ".local", "share", "opencode"), { recursive: true });
    writeFileSync(
      configPath(home),
      JSON.stringify({
        theme: "dark",
        provider: { openrouter: { options: { baseURL: "https://openrouter.ai/api/v1" } } },
      }),
    );
    writeFileSync(authPath(home), JSON.stringify({ openrouter: { type: "api", key: "sk-or-1" } }));
    opencodeAdapter.write(home, { baseUrl: BASE_URL, key: KEY, availableModels: MODELS });
    const config = readJson(configPath(home));
    expect(config.theme).toBe("dark");
    expect(config.provider.openrouter.options.baseURL).toBe("https://openrouter.ai/api/v1");
    expect(config.provider.apiflux.options.baseURL).toBe(`${BASE_URL}/v1`);
    const auth = readJson(authPath(home));
    expect(auth.openrouter).toEqual({ type: "api", key: "sk-or-1" });
    expect(auth.apiflux).toEqual({ type: "api", key: KEY });
  });

  test("backs up existing files once and is idempotent", () => {
    const home = tempHome();
    mkdirSync(join(home, ".config", "opencode"), { recursive: true });
    writeFileSync(configPath(home), JSON.stringify({ theme: "dark" }));
    opencodeAdapter.write(home, { baseUrl: BASE_URL, key: KEY, availableModels: MODELS });
    const first = readFileSync(configPath(home), "utf8");
    opencodeAdapter.write(home, { baseUrl: BASE_URL, key: KEY, availableModels: MODELS });
    expect(readFileSync(configPath(home), "utf8")).toBe(first);
    const backups = readdirSync(join(home, ".config", "opencode")).filter((f) =>
      f.startsWith("opencode.json.bak."),
    );
    expect(backups.length).toBe(1);
  });
});

describe("opencodeAdapter.plan", () => {
  test("no config → no conflicts", () => {
    expect(opencodeAdapter.plan(tempHome(), { baseUrl: BASE_URL, key: KEY }).conflicts).toEqual([]);
  });

  test("existing apiflux provider with different baseURL → conflict", () => {
    const home = tempHome();
    mkdirSync(join(home, ".config", "opencode"), { recursive: true });
    writeFileSync(
      configPath(home),
      JSON.stringify({ provider: { apiflux: { options: { baseURL: "https://old.example.com/v1" } } } }),
    );
    const { conflicts } = opencodeAdapter.plan(home, { baseUrl: BASE_URL, key: KEY });
    expect(conflicts.length).toBe(1);
    expect(conflicts[0]).toContain("https://old.example.com/v1");
  });

  test("existing different root model → conflict when a model is chosen", () => {
    const home = tempHome();
    mkdirSync(join(home, ".config", "opencode"), { recursive: true });
    writeFileSync(configPath(home), JSON.stringify({ model: "anthropic/claude-sonnet-5" }));
    const { conflicts } = opencodeAdapter.plan(home, {
      baseUrl: BASE_URL,
      key: KEY,
      model: "deepseek-v4-pro",
    });
    expect(conflicts.some((line) => line.includes("anthropic/claude-sonnet-5"))).toBe(true);
  });

  test("existing different auth key → conflict without echoing key material", () => {
    const home = tempHome();
    mkdirSync(join(home, ".local", "share", "opencode"), { recursive: true });
    writeFileSync(authPath(home), JSON.stringify({ apiflux: { type: "api", key: "sk-old-secret" } }));
    const { conflicts } = opencodeAdapter.plan(home, { baseUrl: BASE_URL, key: KEY });
    expect(conflicts.length).toBe(1);
    expect(conflicts[0]).not.toContain("sk-old-secret");
    expect(conflicts[0]).toContain("sk-***");
  });

  test("stale options.apiKey in our provider entry → conflict (it would shadow auth.json)", () => {
    const home = tempHome();
    mkdirSync(join(home, ".config", "opencode"), { recursive: true });
    writeFileSync(
      configPath(home),
      JSON.stringify({ provider: { apiflux: { options: { baseURL: `${BASE_URL}/v1`, apiKey: "sk-stale" } } } }),
    );
    const { conflicts } = opencodeAdapter.plan(home, { baseUrl: BASE_URL, key: KEY });
    expect(conflicts.length).toBe(1);
    expect(conflicts[0]).not.toContain("sk-stale");
  });
});
