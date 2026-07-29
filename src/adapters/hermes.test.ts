import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { hermesAdapter } from "./hermes";

const BASE_URL = "https://apiflux.ai";
const KEY = "sk-test1234";
const MODELS = ["deepseek-v4-pro", "kimi-k2.6", "claude-sonnet-5"];

function tempHome(): string {
  return mkdtempSync(join(tmpdir(), "apiflux-cli-hermes-"));
}

function hermesDir(home: string): string {
  return join(home, ".hermes");
}

function readConfig(home: string): any {
  return parse(readFileSync(join(hermesDir(home), "config.yaml"), "utf8"));
}

// Hermes honors HERMES_HOME (hermes_constants.py); pin it to unset so paths
// derive from the temp home.
let savedHermesHome: string | undefined;
beforeEach(() => {
  savedHermesHome = process.env.HERMES_HOME;
  delete process.env.HERMES_HOME;
});
afterEach(() => {
  if (savedHermesHome === undefined) delete process.env.HERMES_HOME;
  else process.env.HERMES_HOME = savedHermesHome;
});

describe("hermesAdapter.detect", () => {
  test("false without ~/.hermes, true with it", () => {
    const home = tempHome();
    expect(hermesAdapter.detect(home)).toBe(false);
    mkdirSync(hermesDir(home));
    expect(hermesAdapter.detect(home)).toBe(true);
  });

  test("honors HERMES_HOME override", () => {
    const home = tempHome();
    process.env.HERMES_HOME = join(home, "custom-hermes");
    expect(hermesAdapter.detect(home)).toBe(false);
    mkdirSync(join(home, "custom-hermes"), { recursive: true });
    expect(hermesAdapter.detect(home)).toBe(true);
  });
});

describe("hermesAdapter.write", () => {
  test("writes custom_providers entry, key_env indirection, and key into .env only", () => {
    const home = tempHome();
    const notes = hermesAdapter.write(home, { baseUrl: BASE_URL, key: KEY, availableModels: MODELS });
    const config = readConfig(home);
    const entry = config.custom_providers[0];
    expect(entry.name).toBe("ApiFlux");
    expect(entry.base_url).toBe(`${BASE_URL}/v1`);
    expect(entry.key_env).toBe("APIFLUX_API_KEY");
    expect(entry.models).toEqual(MODELS);
    // The key lives only in .env (0600), never in config.yaml.
    expect(readFileSync(join(hermesDir(home), "config.yaml"), "utf8")).not.toContain(KEY);
    const env = readFileSync(join(hermesDir(home), ".env"), "utf8");
    expect(env).toContain(`APIFLUX_API_KEY=${KEY}`);
    expect(statSync(join(hermesDir(home), ".env")).mode & 0o777).toBe(0o600);
    expect(notes.join("\n")).toContain("config.yaml");
  });

  test("chosen model sets model.provider and model.default", () => {
    const home = tempHome();
    hermesAdapter.write(home, {
      baseUrl: BASE_URL,
      key: KEY,
      model: "deepseek-v4-pro",
      availableModels: MODELS,
    });
    const config = readConfig(home);
    expect(config.model.provider).toBe("apiflux");
    expect(config.model.default).toBe("deepseek-v4-pro");
  });

  test("no chosen model leaves model section untouched", () => {
    const home = tempHome();
    mkdirSync(hermesDir(home), { recursive: true });
    writeFileSync(
      join(hermesDir(home), "config.yaml"),
      "model:\n  provider: openrouter\n  default: anthropic/claude-opus-4.6\n",
    );
    hermesAdapter.write(home, { baseUrl: BASE_URL, key: KEY, availableModels: MODELS });
    const config = readConfig(home);
    expect(config.model.provider).toBe("openrouter");
    expect(config.model.default).toBe("anthropic/claude-opus-4.6");
  });

  test("preserves comments, other providers, and other .env lines", () => {
    const home = tempHome();
    mkdirSync(hermesDir(home), { recursive: true });
    writeFileSync(
      join(hermesDir(home), "config.yaml"),
      [
        "# my hermes config",
        "custom_providers:",
        "  - name: MyProxy",
        "    base_url: https://proxy.example.com/v1",
        "    key_env: MYPROXY_KEY",
        "model:",
        "  provider: myproxy  # keep this",
        "  default: some-model",
        "",
      ].join("\n"),
    );
    writeFileSync(join(hermesDir(home), ".env"), "OPENROUTER_API_KEY=sk-or-1\n");
    hermesAdapter.write(home, { baseUrl: BASE_URL, key: KEY, availableModels: MODELS });
    const raw = readFileSync(join(hermesDir(home), "config.yaml"), "utf8");
    expect(raw).toContain("# my hermes config");
    expect(raw).toContain("# keep this");
    const config = readConfig(home);
    expect(config.custom_providers.length).toBe(2);
    expect(config.custom_providers[0].name).toBe("MyProxy");
    expect(config.custom_providers[1].name).toBe("ApiFlux");
    const env = readFileSync(join(hermesDir(home), ".env"), "utf8");
    expect(env).toContain("OPENROUTER_API_KEY=sk-or-1");
    expect(env).toContain(`APIFLUX_API_KEY=${KEY}`);
  });

  test("re-running updates the existing ApiFlux entry instead of duplicating", () => {
    const home = tempHome();
    hermesAdapter.write(home, { baseUrl: BASE_URL, key: KEY, availableModels: MODELS });
    hermesAdapter.write(home, { baseUrl: BASE_URL, key: "sk-rotated", availableModels: ["only-one"] });
    const config = readConfig(home);
    expect(config.custom_providers.length).toBe(1);
    expect(config.custom_providers[0].models).toEqual(["only-one"]);
    const env = readFileSync(join(hermesDir(home), ".env"), "utf8");
    expect(env).toContain("APIFLUX_API_KEY=sk-rotated");
    expect(env).not.toContain(KEY);
    // Single line, updated in place.
    expect(env.match(/APIFLUX_API_KEY/g)?.length).toBe(1);
  });

  test("backs up existing files once", () => {
    const home = tempHome();
    mkdirSync(hermesDir(home), { recursive: true });
    writeFileSync(join(hermesDir(home), "config.yaml"), "model:\n  provider: auto\n");
    hermesAdapter.write(home, { baseUrl: BASE_URL, key: KEY, availableModels: MODELS });
    hermesAdapter.write(home, { baseUrl: BASE_URL, key: KEY, availableModels: MODELS });
    const backups = readdirSync(hermesDir(home)).filter((f) => f.startsWith("config.yaml.bak."));
    expect(backups.length).toBe(1);
  });

  test("unparseable config.yaml is left untouched with manual instructions", () => {
    const home = tempHome();
    mkdirSync(hermesDir(home), { recursive: true });
    const original = "model: [unclosed\n";
    writeFileSync(join(hermesDir(home), "config.yaml"), original);
    const notes = hermesAdapter.write(home, { baseUrl: BASE_URL, key: KEY, availableModels: MODELS });
    expect(readFileSync(join(hermesDir(home), "config.yaml"), "utf8")).toBe(original);
    expect(notes.join("\n")).toContain("custom_providers");
    // .env is still written so the manual merge is key-free.
    expect(readFileSync(join(hermesDir(home), ".env"), "utf8")).toContain(`APIFLUX_API_KEY=${KEY}`);
  });
});

describe("hermesAdapter.plan", () => {
  test("no config → no conflicts", () => {
    expect(hermesAdapter.plan(tempHome(), { baseUrl: BASE_URL, key: KEY }).conflicts).toEqual([]);
  });

  test("existing ApiFlux entry with different base_url → conflict", () => {
    const home = tempHome();
    mkdirSync(hermesDir(home), { recursive: true });
    writeFileSync(
      join(hermesDir(home), "config.yaml"),
      "custom_providers:\n  - name: ApiFlux\n    base_url: https://old.example.com/v1\n",
    );
    const { conflicts } = hermesAdapter.plan(home, { baseUrl: BASE_URL, key: KEY });
    expect(conflicts.length).toBe(1);
    expect(conflicts[0]).toContain("https://old.example.com/v1");
  });

  test("existing different default model → conflict when a model is chosen", () => {
    const home = tempHome();
    mkdirSync(hermesDir(home), { recursive: true });
    writeFileSync(
      join(hermesDir(home), "config.yaml"),
      "model:\n  provider: openrouter\n  default: anthropic/claude-opus-4.6\n",
    );
    const { conflicts } = hermesAdapter.plan(home, { baseUrl: BASE_URL, key: KEY, model: "deepseek-v4-pro" });
    expect(conflicts.some((line) => line.includes("anthropic/claude-opus-4.6"))).toBe(true);
  });

  test("existing different APIFLUX_API_KEY in .env → conflict without echoing keys", () => {
    const home = tempHome();
    mkdirSync(hermesDir(home), { recursive: true });
    writeFileSync(join(hermesDir(home), ".env"), "APIFLUX_API_KEY=sk-old-secret\n");
    const { conflicts } = hermesAdapter.plan(home, { baseUrl: BASE_URL, key: KEY });
    expect(conflicts.length).toBe(1);
    expect(conflicts[0]).not.toContain("sk-old-secret");
    expect(conflicts[0]).toContain("sk-***");
  });

  test("unparseable config.yaml → conflict announcing manual merge", () => {
    const home = tempHome();
    mkdirSync(hermesDir(home), { recursive: true });
    writeFileSync(join(hermesDir(home), "config.yaml"), "model: [unclosed\n");
    const { conflicts } = hermesAdapter.plan(home, { baseUrl: BASE_URL, key: KEY });
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].toLowerCase()).toContain("manual");
  });
});
