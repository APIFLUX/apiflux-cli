import { describe, expect, test } from "bun:test";
import { genericExportAdapter } from "./generic-export";

const BASE_URL = "https://api.apiflux.ai";
const KEY = "sk-test1234";

describe("genericExportAdapter", () => {
  test("is always detected", () => {
    expect(genericExportAdapter.detect("/nonexistent")).toBe(true);
  });

  test("never reports conflicts", () => {
    expect(genericExportAdapter.plan("/nonexistent", { baseUrl: BASE_URL, key: KEY }).conflicts).toEqual([]);
  });

  test("write touches no files and returns export lines with /v1 URL and real key", () => {
    const notes = genericExportAdapter.write("/nonexistent", { baseUrl: BASE_URL, key: KEY });
    const text = notes.join("\n");
    expect(text).toContain(`export OPENAI_BASE_URL="${BASE_URL}/v1"`);
    expect(text).toContain(`export OPENAI_API_KEY="${KEY}"`);
  });
});

describe("genericExportAdapter model", () => {
  test("chosen model adds an OPENAI_MODEL export line", () => {
    const lines = genericExportAdapter.write("/nowhere", {
      baseUrl: "https://apiflux.ai",
      key: "sk-x",
      model: "deepseek-v4-pro",
    });
    expect(lines.some((line) => line === 'export OPENAI_MODEL="deepseek-v4-pro"')).toBe(true);
  });

  test("no model → no OPENAI_MODEL line", () => {
    const lines = genericExportAdapter.write("/nowhere", {
      baseUrl: "https://apiflux.ai",
      key: "sk-x",
    });
    expect(lines.join("\n")).not.toContain("OPENAI_MODEL");
  });
});
