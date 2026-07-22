import { describe, expect, test } from "bun:test";
import { parseArgs } from "./args";

describe("parseArgs", () => {
  test("parses init with all flags", () => {
    const parsed = parseArgs([
      "init",
      "--key",
      "sk-xxx",
      "--base-url",
      "https://api.apiflux.ai",
      "--tool",
      "claude-code",
      "--tool",
      "codex",
      "--yes",
      "--skip-verify",
    ]);
    expect(parsed).toEqual({
      command: "init",
      key: "sk-xxx",
      baseUrl: "https://api.apiflux.ai",
      tools: ["claude-code", "codex"],
      yes: true,
      skipVerify: true,
    });
  });

  test("defaults: no key, no tools, prompts expected", () => {
    const parsed = parseArgs(["init"]);
    expect(parsed).toEqual({
      command: "init",
      key: undefined,
      baseUrl: undefined,
      tools: [],
      yes: false,
      skipVerify: false,
    });
  });

  test("supports --key - for stdin", () => {
    expect(parseArgs(["init", "--key", "-"]).key).toBe("-");
  });

  test("rejects unknown flags with usage error", () => {
    expect(() => parseArgs(["init", "--wat"])).toThrow(/usage/i);
  });

  test("rejects unknown command", () => {
    expect(() => parseArgs(["frobnicate"])).toThrow(/usage/i);
  });

  test("no command → help request", () => {
    expect(parseArgs([]).command).toBe("help");
    expect(parseArgs(["--help"]).command).toBe("help");
  });

  test("rejects unknown tool values", () => {
    expect(() => parseArgs(["init", "--tool", "vim"])).toThrow(/tool/i);
  });
});
