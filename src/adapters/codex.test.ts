import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "smol-toml";
import { codexAdapter } from "./codex";

const BASE_URL = "https://api.apiflux.ai";
const KEY = "sk-test1234";

function tempHome(): string {
  return mkdtempSync(join(tmpdir(), "apiflux-cli-codex-"));
}

function configPath(home: string): string {
  return join(home, ".codex", "config.toml");
}

describe("codexAdapter.detect", () => {
  test("false without ~/.codex, true with it", () => {
    const home = tempHome();
    expect(codexAdapter.detect(home)).toBe(false);
    mkdirSync(join(home, ".codex"));
    expect(codexAdapter.detect(home)).toBe(true);
  });
});

describe("codexAdapter.plan", () => {
  test("no config → no conflicts", () => {
    expect(codexAdapter.plan(tempHome(), { baseUrl: BASE_URL, key: KEY }).conflicts).toEqual([]);
  });

  test("existing apiflux provider with different base_url → conflict", () => {
    const home = tempHome();
    mkdirSync(join(home, ".codex"));
    writeFileSync(
      configPath(home),
      `[model_providers.apiflux]\nname = "ApiFlux"\nbase_url = "https://old.example.com/v1"\n`,
    );
    const plan = codexAdapter.plan(home, { baseUrl: BASE_URL, key: KEY });
    expect(plan.conflicts.length).toBe(1);
    expect(plan.conflicts[0]).toContain("https://old.example.com/v1");
  });
});

describe("codexAdapter.write", () => {
  test("creates config.toml with provider table, base_url has /v1 exactly once", () => {
    const home = tempHome();
    const notes = codexAdapter.write(home, { baseUrl: BASE_URL, key: KEY });
    const config = parse(readFileSync(configPath(home), "utf8")) as any;
    expect(config.model_providers.apiflux.base_url).toBe(`${BASE_URL}/v1`);
    expect(config.model_providers.apiflux.env_key).toBe("APIFLUX_API_KEY");
    expect(config.model_providers.apiflux.wire_api).toBe("chat");
    // The key itself must not be written into the TOML file.
    expect(readFileSync(configPath(home), "utf8")).not.toContain(KEY);
    // Post-write instructions must tell the user to export the env var.
    expect(notes.join("\n")).toContain("APIFLUX_API_KEY");
  });

  test("preserves unrelated tables on merge", () => {
    const home = tempHome();
    mkdirSync(join(home, ".codex"));
    writeFileSync(configPath(home), `model = "gpt-5"\n\n[history]\npersistence = "save-all"\n`);
    codexAdapter.write(home, { baseUrl: BASE_URL, key: KEY });
    const config = parse(readFileSync(configPath(home), "utf8")) as any;
    expect(config.model).toBe("gpt-5");
    expect(config.history.persistence).toBe("save-all");
    expect(config.model_providers.apiflux.base_url).toBe(`${BASE_URL}/v1`);
  });

  test("backs up existing config once and is idempotent", () => {
    const home = tempHome();
    mkdirSync(join(home, ".codex"));
    writeFileSync(configPath(home), `model = "gpt-5"\n`);
    codexAdapter.write(home, { baseUrl: BASE_URL, key: KEY });
    const first = readFileSync(configPath(home), "utf8");
    codexAdapter.write(home, { baseUrl: BASE_URL, key: KEY });
    expect(readFileSync(configPath(home), "utf8")).toBe(first);
    const backups = readdirSync(join(home, ".codex")).filter((f) => f.startsWith("config.toml.bak."));
    expect(backups.length).toBe(1);
  });
});
