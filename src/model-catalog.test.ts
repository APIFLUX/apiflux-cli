import { describe, expect, test } from "bun:test";
import { getModelCapabilities, modelCatalog } from "./model-catalog";

// The current production model list (gateway /v1/models, 2026-08-03). The
// catalog must cover every model we sell; new gateway models without an entry
// fall back to bare ids, which silently disables thinking control in Pi.
const LIVE_MODEL_IDS = [
  "claude-fable-5",
  "claude-haiku-4-5",
  "claude-opus-4-6",
  "claude-opus-4-7",
  "claude-opus-4-8",
  "claude-opus-5",
  "claude-sonnet-4-6",
  "claude-sonnet-5",
  "deepseek-v4-flash",
  "deepseek-v4-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite",
  "gemini-3.1-pro-preview",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.7-flash",
  "glm-5.2",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-5",
  "gpt-5-mini",
  "gpt-5.2",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  "gpt-5.5",
  "gpt-5.6-luna",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "kimi-k2.6",
  "kimi-k2.7-code",
  "kimi-k3",
  "qwen3.8-max",
];

const PI_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);

describe("modelCatalog coverage", () => {
  test("covers every model currently sold on the gateway", () => {
    const missing = LIVE_MODEL_IDS.filter((id) => getModelCapabilities(id) === undefined);
    expect(missing).toEqual([]);
  });

  test("unknown ids return undefined", () => {
    expect(getModelCapabilities("totally-new-model")).toBeUndefined();
  });
});

describe("modelCatalog invariants", () => {
  test("every entry has plausible context/output limits", () => {
    for (const [id, caps] of Object.entries(modelCatalog)) {
      expect(caps.contextWindow, id).toBeGreaterThanOrEqual(8192);
      expect(caps.maxTokens, id).toBeGreaterThanOrEqual(4096);
      expect(caps.maxTokens, id).toBeLessThanOrEqual(caps.contextWindow);
    }
  });

  test("thinking metadata only appears on reasoning models", () => {
    for (const [id, caps] of Object.entries(modelCatalog)) {
      if (!caps.reasoning) {
        expect(caps.thinkingLevelMap, id).toBeUndefined();
        expect(caps.compat?.thinkingFormat, id).toBeUndefined();
      }
    }
  });

  test("thinkingLevelMap keys are valid Pi levels", () => {
    for (const [id, caps] of Object.entries(modelCatalog)) {
      for (const level of Object.keys(caps.thinkingLevelMap ?? {})) {
        expect(PI_LEVELS.has(level), `${id}: ${level}`).toBe(true);
      }
    }
  });
});

describe("family-specific entries", () => {
  test("qwen3.8-max matches the locally verified fix from issue #7", () => {
    expect(getModelCapabilities("qwen3.8-max")).toMatchObject({
      reasoning: true,
      compat: { supportsReasoningEffort: true, thinkingFormat: "qwen" },
      thinkingLevelMap: {
        minimal: null,
        low: "low",
        medium: "medium",
        high: "high",
        xhigh: "high",
        max: "high",
      },
    });
  });

  test("claude models clamp levels to the gateway's low/medium/high mapping", () => {
    const caps = getModelCapabilities("claude-sonnet-5");
    expect(caps?.reasoning).toBe(true);
    expect(caps?.contextWindow).toBe(1_000_000);
    // new-api's claude channel only maps low/medium/high to thinking budgets;
    // anything else must collapse onto those levels or thinking silently stays off.
    expect(caps?.thinkingLevelMap).toMatchObject({ xhigh: "high", max: "high" });
    expect(caps?.compat?.thinkingFormat).toBeUndefined();
  });

  test("gpt-4o is a non-reasoning model with its real 128K window", () => {
    expect(getModelCapabilities("gpt-4o")).toEqual({
      reasoning: false,
      contextWindow: 128_000,
      maxTokens: 16_384,
    });
  });

  test("deepseek v4 uses the deepseek thinking format", () => {
    const caps = getModelCapabilities("deepseek-v4-pro");
    expect(caps?.compat?.thinkingFormat).toBe("deepseek");
    expect(caps?.maxTokens).toBe(384_000);
  });

  test("kimi-k3 supports reasoning effort, kimi-k2.6 does not", () => {
    expect(getModelCapabilities("kimi-k3")?.compat?.supportsReasoningEffort).toBe(true);
    expect(getModelCapabilities("kimi-k2.6")?.compat?.supportsReasoningEffort).toBe(false);
  });

  test("glm-5.2 uses the zai thinking format", () => {
    expect(getModelCapabilities("glm-5.2")?.compat?.thinkingFormat).toBe("zai");
  });

  test("gemini-3.7-flash uses the Gemini reasoning map and 1M context", () => {
    expect(getModelCapabilities("gemini-3.7-flash")).toEqual({
      reasoning: true,
      contextWindow: 1_048_576,
      maxTokens: 65_536,
      thinkingLevelMap: {
        minimal: "minimal",
        low: "low",
        medium: "medium",
        high: "high",
        xhigh: "high",
        max: "high",
      },
    });
  });
});
