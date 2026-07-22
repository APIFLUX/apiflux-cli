import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
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
    return Response.json({ data: [{ id: "claude-sonnet-5" }] });
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
    expect(lines.join("\n")).toContain("1 model");
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
