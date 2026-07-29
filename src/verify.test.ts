import { afterAll, describe, expect, test } from "bun:test";
import { verifyKey } from "./verify";

const KEY = "sk-verify-test";

const server = Bun.serve({
  port: 0,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname !== "/v1/models") return new Response("not found", { status: 404 });
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${KEY}`) return new Response("{}", { status: 401 });
    return Response.json({ data: [{ id: "claude-sonnet-5" }, { id: "gpt-5" }] });
  },
});

afterAll(() => server.stop());

const baseUrl = `http://127.0.0.1:${server.port}`;

describe("verifyKey", () => {
  test("valid key → ok with model count", async () => {
    const result = await verifyKey(baseUrl, KEY);
    expect(result).toEqual({
      status: "ok",
      modelCount: 2,
      models: ["claude-sonnet-5", "gpt-5"],
    });
  });

  test("invalid key → unauthorized", async () => {
    const result = await verifyKey(baseUrl, "sk-wrong");
    expect(result.status).toBe("unauthorized");
  });

  test("unreachable host → network error with masked message", async () => {
    const result = await verifyKey("http://127.0.0.1:1", KEY);
    expect(result.status).toBe("network-error");
    if (result.status === "network-error") {
      expect(result.message).not.toContain(KEY);
    }
  });
});
