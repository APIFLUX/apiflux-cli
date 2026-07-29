import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import JSON5 from "json5";
import { withV1 } from "../endpoint";
import type { Adapter, AdapterInput } from "./types";
import { backupOnce } from "./backup";

// OpenClaw resolves its state dir and config path with env overrides
// (src/config/paths.ts); the adapter must honor the same ones.
function stateDir(home: string): string {
  const override = process.env.OPENCLAW_STATE_DIR;
  if (override) return override.startsWith("~/") ? join(home, override.slice(2)) : override;
  return join(home, ".openclaw");
}

function configPath(home: string): string {
  const override = process.env.OPENCLAW_CONFIG_PATH;
  if (override) return override.startsWith("~/") ? join(home, override.slice(2)) : override;
  return join(stateDir(home), "openclaw.json");
}

/** String-aware JSON5 comment scan, ported from OpenClaw's json5-comments.ts. */
function hasJson5Comments(raw: string): boolean {
  let quote: '"' | "'" | undefined;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "/" && (raw[index + 1] === "/" || raw[index + 1] === "*")) return true;
  }
  return false;
}

interface ConfigFile {
  data: Record<string, unknown>;
  raw: string | undefined;
  /** File exists but cannot be safely rewritten ($include or broken JSON5). */
  unwritable: boolean;
}

function readConfig(path: string): ConfigFile {
  if (!existsSync(path)) return { data: {}, raw: undefined, unwritable: false };
  const raw = readFileSync(path, "utf8");
  try {
    const data = JSON5.parse(raw);
    // Rewriting an $include config would inline the includes; never do that.
    const unwritable = typeof data === "object" && data !== null && "$include" in data;
    return { data: unwritable ? {} : data, raw, unwritable };
  } catch {
    return { data: {}, raw, unwritable: true };
  }
}

function objectAt(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = parent[key];
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function apifluxProvider(input: AdapterInput): Record<string, unknown> {
  const modelIds = input.availableModels ?? (input.model === undefined ? [] : [input.model]);
  return {
    baseUrl: withV1(input.baseUrl),
    // Literal key matches how OpenClaw's own Control UI stores provider keys;
    // ${VAR} references abort config load when the var is missing.
    apiKey: input.key,
    api: "openai-completions",
    // Official docs' minimal shape; the runtime fills remaining metadata.
    models: modelIds.map((id) => ({ id, name: id })),
  };
}

export const openclawAdapter: Adapter = {
  id: "openclaw",
  label: "OpenClaw",

  detect(home) {
    return existsSync(stateDir(home));
  },

  plan(home, input: AdapterInput) {
    const conflicts: string[] = [];
    const path = configPath(home);
    const config = readConfig(path);
    if (config.unwritable) {
      conflicts.push(
        "OpenClaw: openclaw.json uses $include or is not parseable; it will be left untouched and a manual snippet printed.",
      );
      return { conflicts };
    }
    const existing = objectAt(objectAt(objectAt(config.data, "models"), "providers"), "apiflux");
    const targetUrl = withV1(input.baseUrl);
    if (typeof existing.baseUrl === "string" && existing.baseUrl !== targetUrl) {
      conflicts.push(`OpenClaw: replace models.providers.apiflux baseUrl ${existing.baseUrl} → ${targetUrl}`);
    }
    if (typeof existing.apiKey === "string" && existing.apiKey !== input.key) {
      // Never echo key values, old or new.
      conflicts.push("OpenClaw: replace existing models.providers.apiflux apiKey (sk-***)");
    }
    if (input.model !== undefined) {
      const model = objectAt(objectAt(config.data, "agents"), "defaults").model;
      const primary =
        typeof model === "string"
          ? model
          : typeof model === "object" && model !== null
            ? (model as Record<string, unknown>).primary
            : undefined;
      const target = `apiflux/${input.model}`;
      if (typeof primary === "string" && primary !== target) {
        conflicts.push(`OpenClaw: replace agents.defaults.model.primary ${primary} → ${target}`);
      }
    }
    if (config.raw !== undefined && hasJson5Comments(config.raw)) {
      // Same caveat OpenClaw's own config writer prints.
      conflicts.push("OpenClaw: rewriting openclaw.json will strip its JSON5 comments (matching OpenClaw's own writes).");
    }
    return { conflicts };
  },

  write(home, input: AdapterInput) {
    const path = configPath(home);
    const config = readConfig(path);
    if (config.unwritable) {
      return [
        `OpenClaw: ${path} uses $include or is not parseable; left untouched. Merge this under models.providers yourself:`,
        `  "apiflux": ${JSON.stringify(apifluxProvider(input))}`,
        ...(input.model === undefined
          ? []
          : [`  and set agents.defaults.model.primary to "apiflux/${input.model}"`]),
      ];
    }
    backupOnce(path);
    const models = objectAt(config.data, "models");
    models.providers = { ...objectAt(models, "providers"), apiflux: apifluxProvider(input) };
    config.data.models = models;
    if (input.model !== undefined) {
      const agents = objectAt(config.data, "agents");
      const defaults = objectAt(agents, "defaults");
      const existingModel = defaults.model;
      const carried =
        typeof existingModel === "object" && existingModel !== null
          ? (existingModel as Record<string, unknown>)
          : {};
      defaults.model = { ...carried, primary: `apiflux/${input.model}` };
      agents.defaults = defaults;
      config.data.agents = agents;
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(config.data, null, 2) + "\n");
    const notes = [`OpenClaw: wrote models.providers.apiflux to ${path}`];
    notes.push(
      input.model !== undefined
        ? `OpenClaw: default model set to apiflux/${input.model}`
        : "OpenClaw: pick a model with: openclaw models (provider apiflux)",
    );
    return notes;
  },
};
