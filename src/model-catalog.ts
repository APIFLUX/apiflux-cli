/**
 * Capability metadata for every model sold on the ApiFlux gateway, keyed by
 * gateway model id. Harnesses that only get bare ids assume "non-reasoning,
 * ~128K context" defaults, which silently breaks thinking-level control and
 * misreports context windows (apiflux-cli issue #7).
 *
 * Values mirror Pi's official models catalog (pi.dev) for each family, then
 * adjusted for how the ApiFlux gateway actually relays thinking controls:
 * - Claude channel maps `reasoning_effort` low/medium/high to thinking
 *   budgets and ignores every other level, so higher levels collapse to high.
 * - Gemini channel maps `reasoning_effort` minimal/low/medium/high to a
 *   thinking-budget percentage; higher levels collapse to high.
 * - OpenAI/DeepSeek/Kimi/GLM/Qwen bodies pass through, so their entries keep
 *   the upstream-native format and level maps.
 *
 * `compat` and `thinkingLevelMap` follow Pi's schema (the richest consumer);
 * other adapters only read the neutral fields.
 */

export interface ModelCapabilities {
  reasoning: boolean;
  contextWindow: number;
  maxTokens: number;
  compat?: Record<string, unknown>;
  thinkingLevelMap?: Record<string, string | null>;
}

type LevelMap = Record<string, string | null>;

// Gateway collapses anything beyond low/medium/high onto high (budget-mapped).
const GATEWAY_EFFORT_LEVELS: LevelMap = {
  minimal: null,
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "high",
  max: "high",
};

const GEMINI_EFFORT_LEVELS: LevelMap = {
  minimal: "minimal",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "high",
  max: "high",
};

function claude(contextWindow: number, maxTokens: number): ModelCapabilities {
  return { reasoning: true, contextWindow, maxTokens, thinkingLevelMap: GATEWAY_EFFORT_LEVELS };
}

function gemini(): ModelCapabilities {
  return {
    reasoning: true,
    contextWindow: 1_048_576,
    maxTokens: 65_536,
    thinkingLevelMap: GEMINI_EFFORT_LEVELS,
  };
}

function gpt(contextWindow: number, thinkingLevelMap: LevelMap): ModelCapabilities {
  return { reasoning: true, contextWindow, maxTokens: 128_000, thinkingLevelMap };
}

const GPT5_LEVELS: LevelMap = {
  off: null,
  minimal: "minimal",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: null,
  max: null,
};

const GPT54_LEVELS: LevelMap = {
  off: "none",
  minimal: null,
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: null,
};

const GPT56_LEVELS: LevelMap = { ...GPT54_LEVELS, max: "max" };

function deepseekV4(): ModelCapabilities {
  return {
    reasoning: true,
    contextWindow: 1_000_000,
    maxTokens: 384_000,
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
      requiresReasoningContentOnAssistantMessages: true,
      thinkingFormat: "deepseek",
    },
    thinkingLevelMap: { minimal: null, low: null, medium: null, high: "high", max: "max" },
  };
}

function kimi(overrides: Partial<ModelCapabilities>): ModelCapabilities {
  return {
    reasoning: true,
    contextWindow: 262_144,
    maxTokens: 262_144,
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      supportsStrictMode: false,
      maxTokensField: "max_tokens",
      thinkingFormat: "deepseek",
    },
    ...overrides,
  };
}

export const modelCatalog: Record<string, ModelCapabilities> = {
  // Anthropic
  "claude-fable-5": claude(1_000_000, 128_000),
  "claude-haiku-4-5": claude(200_000, 64_000),
  "claude-opus-4-6": claude(1_000_000, 128_000),
  "claude-opus-4-7": claude(1_000_000, 128_000),
  "claude-opus-4-8": claude(1_000_000, 128_000),
  "claude-opus-5": claude(1_000_000, 128_000),
  "claude-sonnet-4-6": claude(1_000_000, 128_000),
  "claude-sonnet-5": claude(1_000_000, 128_000),

  // Google
  "gemini-2.5-flash": gemini(),
  "gemini-2.5-flash-lite": gemini(),
  "gemini-2.5-pro": gemini(),
  "gemini-3-flash-preview": gemini(),
  "gemini-3.1-flash-lite": gemini(),
  "gemini-3.1-pro-preview": gemini(),
  "gemini-3.5-flash": gemini(),
  "gemini-3.5-flash-lite": gemini(),
  "gemini-3.7-flash": gemini(),

  // OpenAI
  "gpt-4o": { reasoning: false, contextWindow: 128_000, maxTokens: 16_384 },
  "gpt-4o-mini": { reasoning: false, contextWindow: 128_000, maxTokens: 16_384 },
  "gpt-5": gpt(400_000, GPT5_LEVELS),
  "gpt-5-mini": gpt(400_000, GPT5_LEVELS),
  "gpt-5.2": gpt(400_000, GPT54_LEVELS),
  "gpt-5.4": gpt(272_000, GPT54_LEVELS),
  "gpt-5.4-mini": gpt(400_000, GPT54_LEVELS),
  "gpt-5.4-nano": gpt(400_000, GPT54_LEVELS),
  "gpt-5.5": gpt(272_000, GPT54_LEVELS),
  "gpt-5.6-luna": gpt(272_000, GPT56_LEVELS),
  "gpt-5.6-sol": gpt(272_000, GPT56_LEVELS),
  "gpt-5.6-terra": gpt(272_000, GPT56_LEVELS),

  // DeepSeek
  "deepseek-v4-flash": deepseekV4(),
  "deepseek-v4-pro": deepseekV4(),

  // MoonshotAI
  "kimi-k2.6": kimi({}),
  "kimi-k2.7-code": kimi({ thinkingLevelMap: { off: null } }),
  "kimi-k3": kimi({
    contextWindow: 1_048_576,
    maxTokens: 131_072,
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
      supportsStrictMode: false,
      maxTokensField: "max_tokens",
      requiresReasoningContentOnAssistantMessages: true,
      thinkingFormat: "openai",
    },
    thinkingLevelMap: {
      off: null,
      minimal: null,
      low: "low",
      medium: null,
      high: "high",
      xhigh: null,
      max: "max",
    },
  }),

  // Z.ai
  "glm-5.2": {
    reasoning: true,
    contextWindow: 1_000_000,
    maxTokens: 131_072,
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
      maxTokensField: "max_tokens",
      thinkingFormat: "zai",
    },
    thinkingLevelMap: { minimal: null, low: "high", medium: "high", high: "high", max: "max" },
  },

  // Alibaba Qwen — matches the fix verified against production in issue #7.
  "qwen3.8-max": {
    reasoning: true,
    contextWindow: 1_000_000,
    maxTokens: 131_072,
    compat: { supportsReasoningEffort: true, thinkingFormat: "qwen" },
    thinkingLevelMap: GATEWAY_EFFORT_LEVELS,
  },
};

export function getModelCapabilities(id: string): ModelCapabilities | undefined {
  return modelCatalog[id];
}
