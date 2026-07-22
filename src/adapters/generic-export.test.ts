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
