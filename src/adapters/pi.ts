import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { withV1 } from "../endpoint";
import type { Adapter, AdapterInput } from "./types";
import { backupOnce } from "./backup";

// Pi resolves everything under one agent dir (config.ts getAgentDir), with a
// PI_CODING_AGENT_DIR override the adapter must honor.
function agentDir(home: string): string {
  const override = process.env.PI_CODING_AGENT_DIR;
  if (override) return override.startsWith("~/") ? join(home, override.slice(2)) : override;
  return join(home, ".pi", "agent");
}

interface JsonFile {
  data: Record<string, unknown>;
  /** Pi accepts JSONC; we don't. Set when the file exists but JSON.parse fails. */
  unparseable: boolean;
}

function readJson(path: string): JsonFile {
  if (!existsSync(path)) return { data: {}, unparseable: false };
  try {
    return { data: JSON.parse(readFileSync(path, "utf8")), unparseable: false };
  } catch {
    return { data: {}, unparseable: true };
  }
}

function objectAt(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = parent[key];
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function apifluxProvider(input: AdapterInput): Record<string, unknown> {
  const modelIds = input.availableModels ?? (input.model === undefined ? [] : [input.model]);
  return {
    name: "ApiFlux",
    baseUrl: withV1(input.baseUrl),
    api: "openai-completions",
    // Only `id` is required; Pi treats all model metadata as optional.
    models: modelIds.map((id) => ({ id })),
  };
}

export const piAdapter: Adapter = {
  id: "pi",
  label: "Pi",

  detect(home) {
    return process.env.PI_CODING_AGENT_DIR
      ? existsSync(agentDir(home))
      : existsSync(join(home, ".pi"));
  },

  plan(home, input: AdapterInput) {
    const dir = agentDir(home);
    const conflicts: string[] = [];
    const models = readJson(join(dir, "models.json"));
    if (models.unparseable) {
      conflicts.push(
        "Pi: models.json is not plain JSON (comments?); it will be left untouched and a manual snippet printed.",
      );
    } else {
      const existing = objectAt(objectAt(models.data, "providers"), "apiflux");
      const targetUrl = withV1(input.baseUrl);
      if (typeof existing.baseUrl === "string" && existing.baseUrl !== targetUrl) {
        conflicts.push(`Pi: replace providers.apiflux baseUrl ${existing.baseUrl} → ${targetUrl}`);
      }
    }
    const auth = readJson(join(dir, "auth.json"));
    const credential = objectAt(auth.data, "apiflux");
    if (typeof credential.key === "string" && credential.key !== input.key) {
      // Never echo key values, old or new.
      conflicts.push("Pi: replace existing auth.json apiflux key (sk-***)");
    }
    if (input.model !== undefined) {
      const settings = readJson(join(dir, "settings.json")).data;
      const { defaultProvider, defaultModel } = settings;
      if (
        typeof defaultModel === "string" &&
        (defaultModel !== input.model || defaultProvider !== "apiflux")
      ) {
        conflicts.push(`Pi: replace default model ${defaultProvider}/${defaultModel} → apiflux/${input.model}`);
      }
    }
    return { conflicts };
  },

  write(home, input: AdapterInput) {
    const dir = agentDir(home);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const notes: string[] = [];

    const modelsPath = join(dir, "models.json");
    const models = readJson(modelsPath);
    if (models.unparseable) {
      notes.push(
        `Pi: ${modelsPath} is not plain JSON; left untouched. Merge this under "providers" yourself:`,
        `  "apiflux": ${JSON.stringify(apifluxProvider(input))}`,
      );
    } else {
      backupOnce(modelsPath);
      models.data.providers = {
        ...objectAt(models.data, "providers"),
        apiflux: apifluxProvider(input),
      };
      writeFileSync(modelsPath, JSON.stringify(models.data, null, 2) + "\n");
      notes.push(`Pi: wrote providers.apiflux to ${modelsPath}`);
    }

    // The key goes only into Pi's credential store, matching its own 0600 mode.
    const authPath = join(dir, "auth.json");
    backupOnce(authPath);
    const auth = readJson(authPath);
    auth.data.apiflux = { type: "api_key", key: input.key };
    writeFileSync(authPath, JSON.stringify(auth.data, null, 2) + "\n");
    chmodSync(authPath, 0o600);
    notes.push(`Pi: wrote key to ${authPath}`);

    if (input.model !== undefined) {
      const settingsPath = join(dir, "settings.json");
      const settings = readJson(settingsPath);
      if (settings.unparseable) {
        notes.push(`Pi: ${settingsPath} is not plain JSON; pick the default model inside pi with /model.`);
      } else {
        backupOnce(settingsPath);
        settings.data.defaultProvider = "apiflux";
        settings.data.defaultModel = input.model;
        writeFileSync(settingsPath, JSON.stringify(settings.data, null, 2) + "\n");
        notes.push(`Pi: default model set to apiflux/${input.model}`);
      }
    } else {
      notes.push("Pi: pick a model inside pi with /model (provider ApiFlux)");
    }
    return notes;
  },
};
