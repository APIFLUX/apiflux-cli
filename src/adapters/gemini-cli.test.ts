import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { geminiCliAdapter } from "./gemini-cli";

const BASE_URL = "https://apiflux.ai";
const KEY = "sk-test1234";

function tempHome(): string {
  return mkdtempSync(join(tmpdir(), "apiflux-cli-gemini-"));
}

function envPath(home: string): string {
  return join(home, ".gemini", ".env");
}

function withGeminiDir(): string {
  const home = tempHome();
  mkdirSync(join(home, ".gemini"), { recursive: true });
  return home;
}

describe("geminiCliAdapter.detect", () => {
  test("false when ~/.gemini does not exist", () => {
    expect(geminiCliAdapter.detect(tempHome())).toBe(false);
  });

  test("true when ~/.gemini exists", () => {
    expect(geminiCliAdapter.detect(withGeminiDir())).toBe(true);
  });
});

describe("geminiCliAdapter.plan", () => {
  test("no existing .env → no conflicts", () => {
    const home = withGeminiDir();
    expect(geminiCliAdapter.plan(home, { baseUrl: BASE_URL, key: KEY }).conflicts).toEqual([]);
  });

  test("existing same values → no conflicts", () => {
    const home = withGeminiDir();
    writeFileSync(
      envPath(home),
      `GOOGLE_GEMINI_BASE_URL="${BASE_URL}"\nGEMINI_API_KEY="${KEY}"\n`,
    );
    expect(geminiCliAdapter.plan(home, { baseUrl: BASE_URL, key: KEY }).conflicts).toEqual([]);
  });

  test("different base URL and key → conflicts without leaking key material", () => {
    const home = withGeminiDir();
    writeFileSync(
      envPath(home),
      'GOOGLE_GEMINI_BASE_URL="https://other.example"\nGEMINI_API_KEY="sk-old-secret"\n',
    );
    const { conflicts } = geminiCliAdapter.plan(home, { baseUrl: BASE_URL, key: KEY });
    expect(conflicts.some((line) => line.includes("https://other.example"))).toBe(true);
    expect(conflicts.join("\n")).not.toContain("sk-old-secret");
  });

  test("different GEMINI_MODEL → conflict only when a model is chosen", () => {
    const home = withGeminiDir();
    writeFileSync(envPath(home), 'GEMINI_MODEL="gemini-2.5-pro"\n');
    const withModel = geminiCliAdapter.plan(home, {
      baseUrl: BASE_URL,
      key: KEY,
      model: "deepseek-v4-pro",
    });
    expect(withModel.conflicts.some((line) => line.includes("gemini-2.5-pro"))).toBe(true);
    const withoutModel = geminiCliAdapter.plan(home, { baseUrl: BASE_URL, key: KEY });
    expect(withoutModel.conflicts).toEqual([]);
  });
});

describe("geminiCliAdapter.write", () => {
  test("creates .env with base URL and key; no model line without a model", () => {
    const home = withGeminiDir();
    geminiCliAdapter.write(home, { baseUrl: BASE_URL, key: KEY });
    const env = readFileSync(envPath(home), "utf8");
    expect(env).toContain(`GOOGLE_GEMINI_BASE_URL="${BASE_URL}"`);
    expect(env).toContain(`GEMINI_API_KEY="${KEY}"`);
    expect(env).not.toContain("GEMINI_MODEL");
  });

  test("chosen model writes GEMINI_MODEL", () => {
    const home = withGeminiDir();
    geminiCliAdapter.write(home, { baseUrl: BASE_URL, key: KEY, model: "deepseek-v4-pro" });
    expect(readFileSync(envPath(home), "utf8")).toContain('GEMINI_MODEL="deepseek-v4-pro"');
  });

  test("preserves unrelated lines and backs up the existing file once", () => {
    const home = withGeminiDir();
    writeFileSync(envPath(home), 'SOME_OTHER="keep-me"\nGEMINI_API_KEY="sk-old"\n');
    geminiCliAdapter.write(home, { baseUrl: BASE_URL, key: KEY });
    const env = readFileSync(envPath(home), "utf8");
    expect(env).toContain('SOME_OTHER="keep-me"');
    expect(env).toContain(`GEMINI_API_KEY="${KEY}"`);
    expect(env).not.toContain("sk-old");
    const backups = readdirSync(join(home, ".gemini")).filter((f) => f.startsWith(".env.bak."));
    expect(backups.length).toBe(1);
  });
});
