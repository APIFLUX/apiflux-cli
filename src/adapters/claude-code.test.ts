import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeCodeAdapter } from "./claude-code";

const BASE_URL = "https://api.apiflux.ai";
const KEY = "sk-test1234";

function tempHome(): string {
  return mkdtempSync(join(tmpdir(), "apiflux-cli-test-"));
}

function settingsPath(home: string): string {
  return join(home, ".claude", "settings.json");
}

describe("claudeCodeAdapter.detect", () => {
  test("false when ~/.claude does not exist", () => {
    expect(claudeCodeAdapter.detect(tempHome())).toBe(false);
  });

  test("true when ~/.claude exists", () => {
    const home = tempHome();
    mkdirSync(join(home, ".claude"));
    expect(claudeCodeAdapter.detect(home)).toBe(true);
  });
});

describe("claudeCodeAdapter.plan", () => {
  test("no existing file → no conflicts", () => {
    const home = tempHome();
    const plan = claudeCodeAdapter.plan(home, { baseUrl: BASE_URL, key: KEY });
    expect(plan.conflicts).toEqual([]);
  });

  test("existing same values → no conflicts", () => {
    const home = tempHome();
    mkdirSync(join(home, ".claude"));
    writeFileSync(
      settingsPath(home),
      JSON.stringify({ env: { ANTHROPIC_BASE_URL: BASE_URL, ANTHROPIC_AUTH_TOKEN: KEY } }),
    );
    const plan = claudeCodeAdapter.plan(home, { baseUrl: BASE_URL, key: KEY });
    expect(plan.conflicts).toEqual([]);
  });

  test("existing different base URL → conflict reported without leaking key", () => {
    const home = tempHome();
    mkdirSync(join(home, ".claude"));
    writeFileSync(
      settingsPath(home),
      JSON.stringify({ env: { ANTHROPIC_BASE_URL: "https://other.example.com", ANTHROPIC_AUTH_TOKEN: "sk-old999" } }),
    );
    const plan = claudeCodeAdapter.plan(home, { baseUrl: BASE_URL, key: KEY });
    expect(plan.conflicts.length).toBe(2);
    const text = plan.conflicts.join("\n");
    expect(text).toContain("https://other.example.com");
    expect(text).not.toContain("sk-old999");
    expect(text).not.toContain(KEY);
  });
});

describe("claudeCodeAdapter.write", () => {
  test("creates settings.json when missing", () => {
    const home = tempHome();
    claudeCodeAdapter.write(home, { baseUrl: BASE_URL, key: KEY });
    const content = JSON.parse(readFileSync(settingsPath(home), "utf8"));
    expect(content).toEqual({ env: { ANTHROPIC_BASE_URL: BASE_URL, ANTHROPIC_AUTH_TOKEN: KEY } });
  });

  test("deep-merges preserving unrelated keys and 2-space indent", () => {
    const home = tempHome();
    mkdirSync(join(home, ".claude"));
    writeFileSync(
      settingsPath(home),
      JSON.stringify({ permissions: { allow: ["Bash"] }, env: { FOO: "bar" } }, null, 2),
    );
    claudeCodeAdapter.write(home, { baseUrl: BASE_URL, key: KEY });
    const raw = readFileSync(settingsPath(home), "utf8");
    const content = JSON.parse(raw);
    expect(content.permissions).toEqual({ allow: ["Bash"] });
    expect(content.env).toEqual({ FOO: "bar", ANTHROPIC_BASE_URL: BASE_URL, ANTHROPIC_AUTH_TOKEN: KEY });
    expect(raw).toBe(JSON.stringify(content, null, 2) + "\n");
  });

  test("backs up existing file once per run", () => {
    const home = tempHome();
    mkdirSync(join(home, ".claude"));
    writeFileSync(settingsPath(home), JSON.stringify({ env: {} }));
    claudeCodeAdapter.write(home, { baseUrl: BASE_URL, key: KEY });
    const backups = readdirSync(join(home, ".claude")).filter((f) => f.startsWith("settings.json.bak."));
    expect(backups.length).toBe(1);
    expect(JSON.parse(readFileSync(join(home, ".claude", backups[0]!), "utf8"))).toEqual({ env: {} });
  });

  test("no backup created when file did not exist", () => {
    const home = tempHome();
    claudeCodeAdapter.write(home, { baseUrl: BASE_URL, key: KEY });
    const backups = readdirSync(join(home, ".claude")).filter((f) => f.startsWith("settings.json.bak."));
    expect(backups.length).toBe(0);
  });

  test("idempotent: re-running produces byte-identical file", () => {
    const home = tempHome();
    claudeCodeAdapter.write(home, { baseUrl: BASE_URL, key: KEY });
    const first = readFileSync(settingsPath(home), "utf8");
    claudeCodeAdapter.write(home, { baseUrl: BASE_URL, key: KEY });
    expect(readFileSync(settingsPath(home), "utf8")).toBe(first);
  });
});

describe("claudeCodeAdapter model conflicts", () => {
  test("existing different ANTHROPIC_MODEL → conflict when a model is chosen", () => {
    const home = tempHome();
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(
      settingsPath(home),
      JSON.stringify({ env: { ANTHROPIC_MODEL: "claude-opus-5" } }),
    );
    const { conflicts } = claudeCodeAdapter.plan(home, {
      baseUrl: BASE_URL,
      key: KEY,
      model: "deepseek-v4-pro",
    });
    expect(conflicts.some((line) => line.includes("ANTHROPIC_MODEL"))).toBe(true);
  });

  test("no chosen model → existing ANTHROPIC_MODEL is not a conflict", () => {
    const home = tempHome();
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(
      settingsPath(home),
      JSON.stringify({ env: { ANTHROPIC_MODEL: "claude-opus-5" } }),
    );
    const { conflicts } = claudeCodeAdapter.plan(home, { baseUrl: BASE_URL, key: KEY });
    expect(conflicts).toEqual([]);
  });
});
