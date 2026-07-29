import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { piAdapter } from "./pi";

const BASE_URL = "https://apiflux.ai";
const KEY = "sk-test1234";
const MODELS = ["deepseek-v4-pro", "kimi-k2.6", "claude-sonnet-5"];

function tempHome(): string {
  return mkdtempSync(join(tmpdir(), "apiflux-cli-pi-"));
}

function agentDir(home: string): string {
  return join(home, ".pi", "agent");
}

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

// Pi honors PI_CODING_AGENT_DIR (config.ts getAgentDir); pin it to unset so
// paths derive from the temp home.
let savedAgentDir: string | undefined;
beforeEach(() => {
  savedAgentDir = process.env.PI_CODING_AGENT_DIR;
  delete process.env.PI_CODING_AGENT_DIR;
});
afterEach(() => {
  if (savedAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = savedAgentDir;
});

describe("piAdapter.detect", () => {
  test("false without ~/.pi, true with it", () => {
    const home = tempHome();
    expect(piAdapter.detect(home)).toBe(false);
    mkdirSync(join(home, ".pi"));
    expect(piAdapter.detect(home)).toBe(true);
  });

  test("honors PI_CODING_AGENT_DIR override", () => {
    const home = tempHome();
    process.env.PI_CODING_AGENT_DIR = join(home, "custom-agent");
    expect(piAdapter.detect(home)).toBe(false);
    mkdirSync(join(home, "custom-agent"), { recursive: true });
    expect(piAdapter.detect(home)).toBe(true);
  });
});

describe("piAdapter.write", () => {
  test("writes provider to models.json without key material and key to auth.json", () => {
    const home = tempHome();
    const notes = piAdapter.write(home, { baseUrl: BASE_URL, key: KEY, availableModels: MODELS });
    const models = readJson(join(agentDir(home), "models.json"));
    const provider = models.providers.apiflux;
    expect(provider.name).toBe("ApiFlux");
    expect(provider.baseUrl).toBe(`${BASE_URL}/v1`);
    expect(provider.api).toBe("openai-completions");
    expect(provider.models.map((m: any) => m.id).sort()).toEqual([...MODELS].sort());
    expect(readFileSync(join(agentDir(home), "models.json"), "utf8")).not.toContain(KEY);
    const auth = readJson(join(agentDir(home), "auth.json"));
    expect(auth.apiflux).toEqual({ type: "api_key", key: KEY });
    expect(statSync(join(agentDir(home), "auth.json")).mode & 0o777).toBe(0o600);
    expect(notes.join("\n")).toContain("models.json");
  });

  test("chosen model persists defaultProvider/defaultModel in settings.json", () => {
    const home = tempHome();
    piAdapter.write(home, {
      baseUrl: BASE_URL,
      key: KEY,
      model: "deepseek-v4-pro",
      availableModels: MODELS,
    });
    const settings = readJson(join(agentDir(home), "settings.json"));
    expect(settings.defaultProvider).toBe("apiflux");
    expect(settings.defaultModel).toBe("deepseek-v4-pro");
  });

  test("no chosen model leaves settings.json untouched", () => {
    const home = tempHome();
    mkdirSync(agentDir(home), { recursive: true });
    writeFileSync(
      join(agentDir(home), "settings.json"),
      JSON.stringify({ defaultProvider: "anthropic", defaultModel: "claude-sonnet-5", theme: "dark" }),
    );
    piAdapter.write(home, { baseUrl: BASE_URL, key: KEY, availableModels: MODELS });
    const settings = readJson(join(agentDir(home), "settings.json"));
    expect(settings.defaultProvider).toBe("anthropic");
    expect(settings.defaultModel).toBe("claude-sonnet-5");
    expect(settings.theme).toBe("dark");
  });

  test("without availableModels falls back to the chosen model only", () => {
    const home = tempHome();
    piAdapter.write(home, { baseUrl: BASE_URL, key: KEY, model: "kimi-k2.6" });
    const models = readJson(join(agentDir(home), "models.json"));
    expect(models.providers.apiflux.models.map((m: any) => m.id)).toEqual(["kimi-k2.6"]);
  });

  test("preserves other providers, credentials, and settings keys", () => {
    const home = tempHome();
    mkdirSync(agentDir(home), { recursive: true });
    writeFileSync(
      join(agentDir(home), "models.json"),
      JSON.stringify({
        providers: { ollama: { baseUrl: "http://localhost:11434/v1", api: "openai-completions" } },
      }),
    );
    writeFileSync(join(agentDir(home), "auth.json"), JSON.stringify({ openrouter: { type: "api_key", key: "sk-or-1" } }));
    piAdapter.write(home, { baseUrl: BASE_URL, key: KEY, availableModels: MODELS });
    const models = readJson(join(agentDir(home), "models.json"));
    expect(models.providers.ollama.baseUrl).toBe("http://localhost:11434/v1");
    expect(models.providers.apiflux.baseUrl).toBe(`${BASE_URL}/v1`);
    const auth = readJson(join(agentDir(home), "auth.json"));
    expect(auth.openrouter).toEqual({ type: "api_key", key: "sk-or-1" });
    expect(auth.apiflux).toEqual({ type: "api_key", key: KEY });
  });

  test("backs up existing models.json once and is idempotent", () => {
    const home = tempHome();
    mkdirSync(agentDir(home), { recursive: true });
    writeFileSync(join(agentDir(home), "models.json"), JSON.stringify({ providers: {} }));
    piAdapter.write(home, { baseUrl: BASE_URL, key: KEY, availableModels: MODELS });
    const first = readFileSync(join(agentDir(home), "models.json"), "utf8");
    piAdapter.write(home, { baseUrl: BASE_URL, key: KEY, availableModels: MODELS });
    expect(readFileSync(join(agentDir(home), "models.json"), "utf8")).toBe(first);
    const backups = readdirSync(agentDir(home)).filter((f) => f.startsWith("models.json.bak."));
    expect(backups.length).toBe(1);
  });

  test("unparseable models.json (JSONC comments) is left untouched with manual instructions", () => {
    const home = tempHome();
    mkdirSync(agentDir(home), { recursive: true });
    const original = `{\n  // my hand-tuned providers\n  "providers": {}\n}\n`;
    writeFileSync(join(agentDir(home), "models.json"), original);
    const notes = piAdapter.write(home, { baseUrl: BASE_URL, key: KEY, availableModels: MODELS });
    expect(readFileSync(join(agentDir(home), "models.json"), "utf8")).toBe(original);
    // Manual snippet must still be offered, and auth.json still written.
    expect(notes.join("\n")).toContain('"apiflux"');
    expect(readJson(join(agentDir(home), "auth.json")).apiflux.key).toBe(KEY);
  });
});

describe("piAdapter.plan", () => {
  test("no config → no conflicts", () => {
    expect(piAdapter.plan(tempHome(), { baseUrl: BASE_URL, key: KEY }).conflicts).toEqual([]);
  });

  test("existing apiflux provider with different baseUrl → conflict", () => {
    const home = tempHome();
    mkdirSync(agentDir(home), { recursive: true });
    writeFileSync(
      join(agentDir(home), "models.json"),
      JSON.stringify({ providers: { apiflux: { baseUrl: "https://old.example.com/v1" } } }),
    );
    const { conflicts } = piAdapter.plan(home, { baseUrl: BASE_URL, key: KEY });
    expect(conflicts.length).toBe(1);
    expect(conflicts[0]).toContain("https://old.example.com/v1");
  });

  test("existing different default model/provider → conflicts when a model is chosen", () => {
    const home = tempHome();
    mkdirSync(agentDir(home), { recursive: true });
    writeFileSync(
      join(agentDir(home), "settings.json"),
      JSON.stringify({ defaultProvider: "anthropic", defaultModel: "claude-sonnet-5" }),
    );
    const { conflicts } = piAdapter.plan(home, { baseUrl: BASE_URL, key: KEY, model: "deepseek-v4-pro" });
    expect(conflicts.some((line) => line.includes("claude-sonnet-5"))).toBe(true);
  });

  test("existing different auth key → conflict without echoing key material", () => {
    const home = tempHome();
    mkdirSync(agentDir(home), { recursive: true });
    writeFileSync(
      join(agentDir(home), "auth.json"),
      JSON.stringify({ apiflux: { type: "api_key", key: "sk-old-secret" } }),
    );
    const { conflicts } = piAdapter.plan(home, { baseUrl: BASE_URL, key: KEY });
    expect(conflicts.length).toBe(1);
    expect(conflicts[0]).not.toContain("sk-old-secret");
    expect(conflicts[0]).toContain("sk-***");
  });

  test("unparseable models.json → conflict announcing manual merge", () => {
    const home = tempHome();
    mkdirSync(agentDir(home), { recursive: true });
    writeFileSync(join(agentDir(home), "models.json"), `{ // comment\n  "providers": {} }`);
    const { conflicts } = piAdapter.plan(home, { baseUrl: BASE_URL, key: KEY });
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].toLowerCase()).toContain("manual");
  });
});
