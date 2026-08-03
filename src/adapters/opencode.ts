import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { withV1 } from "../endpoint";
import { getModelCapabilities } from "../model-catalog";
import type { Adapter, AdapterInput } from "./types";
import { backupOnce } from "./backup";

// models.dev schema: without limit.context opencode assumes a generic ~128K
// window for every model; unknown gateway ids keep the minimal shape.
function opencodeModel(id: string): Record<string, unknown> {
  const caps = getModelCapabilities(id);
  if (!caps) return { name: id };
  return {
    name: id,
    reasoning: caps.reasoning,
    limit: { context: caps.contextWindow, output: caps.maxTokens },
  };
}

// opencode resolves both dirs via xdg-basedir (packages/core/src/global.ts),
// so the adapter must honor the same env overrides.
function configDir(home: string): string {
  return join(process.env.XDG_CONFIG_HOME ?? join(home, ".config"), "opencode");
}

function dataDir(home: string): string {
  return join(process.env.XDG_DATA_HOME ?? join(home, ".local", "share"), "opencode");
}

function configPath(home: string): string {
  return join(configDir(home), "opencode.json");
}

function authPath(home: string): string {
  return join(dataDir(home), "auth.json");
}

function readJson(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8"));
}

function objectAt(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = parent[key];
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function apifluxProviderOf(config: Record<string, unknown>): Record<string, unknown> {
  return objectAt(objectAt(config, "provider"), "apiflux");
}

export const opencodeAdapter: Adapter = {
  id: "opencode",
  label: "OpenCode",

  detect(home) {
    return existsSync(configDir(home)) || existsSync(dataDir(home));
  },

  plan(home, input: AdapterInput) {
    const conflicts: string[] = [];
    const config = readJson(configPath(home));
    const options = objectAt(apifluxProviderOf(config), "options");
    const targetUrl = withV1(input.baseUrl);
    if (typeof options.baseURL === "string" && options.baseURL !== targetUrl) {
      conflicts.push(`OpenCode: replace provider.apiflux baseURL ${options.baseURL} → ${targetUrl}`);
    }
    // A literal apiKey in config shadows auth.json (provider.ts resolves
    // config options first), so a stale one must be removed on write.
    if (typeof options.apiKey === "string" && options.apiKey !== input.key) {
      conflicts.push("OpenCode: remove stale provider.apiflux apiKey (sk-***) in favor of auth.json");
    }
    if (input.model !== undefined) {
      const target = `apiflux/${input.model}`;
      if (typeof config.model === "string" && config.model !== target) {
        conflicts.push(`OpenCode: replace default model ${config.model} → ${target}`);
      }
    }
    const auth = objectAt(readJson(authPath(home)), "apiflux");
    if (typeof auth.key === "string" && auth.key !== input.key) {
      // Never echo key values, old or new.
      conflicts.push("OpenCode: replace existing auth.json apiflux key (sk-***)");
    }
    return { conflicts };
  },

  write(home, input: AdapterInput) {
    const cfgPath = configPath(home);
    backupOnce(cfgPath);
    const config = readJson(cfgPath);
    const modelIds = input.availableModels ?? (input.model === undefined ? [] : [input.model]);
    config.provider = {
      ...objectAt(config, "provider"),
      apiflux: {
        npm: "@ai-sdk/openai-compatible",
        name: "ApiFlux",
        // The key never goes into opencode.json; it lives in auth.json below.
        options: { baseURL: withV1(input.baseUrl) },
        models: Object.fromEntries(modelIds.map((id) => [id, opencodeModel(id)])),
      },
    };
    if (input.model !== undefined) {
      config.model = `apiflux/${input.model}`;
    }
    mkdirSync(dirname(cfgPath), { recursive: true });
    writeFileSync(cfgPath, JSON.stringify(config, null, 2) + "\n");

    const keyPath = authPath(home);
    backupOnce(keyPath);
    const auth = readJson(keyPath);
    auth.apiflux = { type: "api", key: input.key };
    mkdirSync(dirname(keyPath), { recursive: true });
    writeFileSync(keyPath, JSON.stringify(auth, null, 2) + "\n");
    // opencode writes auth.json with 0600 itself; match it.
    chmodSync(keyPath, 0o600);

    const notes = [
      `OpenCode: wrote provider.apiflux to ${cfgPath}`,
      `OpenCode: wrote key to ${keyPath}`,
    ];
    notes.push(
      input.model !== undefined
        ? `OpenCode: default model set to apiflux/${input.model}`
        : "OpenCode: pick a model inside opencode with /models (provider ApiFlux)",
    );
    return notes;
  },
};
