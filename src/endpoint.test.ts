import { describe, expect, test } from "bun:test";
import { normalizeBaseUrl, withV1 } from "./endpoint";

describe("normalizeBaseUrl", () => {
  test("strips trailing slashes", () => {
    expect(normalizeBaseUrl("https://api.apiflux.ai/")).toBe("https://api.apiflux.ai");
    expect(normalizeBaseUrl("https://api.apiflux.ai//")).toBe("https://api.apiflux.ai");
  });

  test("keeps a clean https URL unchanged", () => {
    expect(normalizeBaseUrl("https://api.apiflux.ai")).toBe("https://api.apiflux.ai");
  });

  test("rejects http:// for non-localhost hosts", () => {
    expect(() => normalizeBaseUrl("http://api.apiflux.ai")).toThrow(/https/);
  });

  test("allows http for localhost and 127.0.0.1", () => {
    expect(normalizeBaseUrl("http://localhost:3000/")).toBe("http://localhost:3000");
    expect(normalizeBaseUrl("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
  });

  test("rejects non-URL garbage", () => {
    expect(() => normalizeBaseUrl("not a url")).toThrow();
    expect(() => normalizeBaseUrl("")).toThrow();
  });
});

describe("withV1", () => {
  test("appends /v1 exactly once", () => {
    expect(withV1("https://api.apiflux.ai")).toBe("https://api.apiflux.ai/v1");
    expect(withV1("https://api.apiflux.ai/v1")).toBe("https://api.apiflux.ai/v1");
  });

  test("normalizes trailing slash before appending", () => {
    expect(withV1("https://api.apiflux.ai/")).toBe("https://api.apiflux.ai/v1");
  });
});
