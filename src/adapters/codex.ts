import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "smol-toml";
import { withV1 } from "../endpoint";
import type { Adapter, AdapterInput } from "./types";
import { backupOnce } from "./backup";

function configPath(home: string): string {
  return join(home, ".codex", "config.toml");
}

function readConfig(home: string): Record<string, unknown> {
  const path = configPath(home);
  if (!existsSync(path)) return {};
  return parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function apifluxProviderOf(config: Record<string, unknown>): Record<string, unknown> | undefined {
  const providers = config.model_providers;
  if (typeof providers !== "object" || providers === null) return undefined;
  const entry = (providers as Record<string, unknown>).apiflux;
  return typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : undefined;
}

export const codexAdapter: Adapter = {
  id: "codex",
  label: "Codex CLI",

  detect(home) {
    return existsSync(join(home, ".codex"));
  },

  plan(home, input: AdapterInput) {
    const conflicts: string[] = [];
    const existing = apifluxProviderOf(readConfig(home));
    const targetUrl = withV1(input.baseUrl);
    if (existing && typeof existing.base_url === "string" && existing.base_url !== targetUrl) {
      conflicts.push(`Codex: replace model_providers.apiflux base_url ${existing.base_url} → ${targetUrl}`);
    }
    if (input.model !== undefined) {
      const config = readConfig(home);
      if (typeof config.model === "string" && config.model !== input.model) {
        conflicts.push(`Codex: replace default model ${config.model} → ${input.model}`);
      }
      if (typeof config.model_provider === "string" && config.model_provider !== "apiflux") {
        conflicts.push(`Codex: replace default model_provider ${config.model_provider} → apiflux`);
      }
    }
    return { conflicts };
  },

  write(home, input: AdapterInput) {
    const path = configPath(home);
    backupOnce(path);
    const config = readConfig(home);
    const providers =
      typeof config.model_providers === "object" && config.model_providers !== null
        ? (config.model_providers as Record<string, unknown>)
        : {};
    providers.apiflux = {
      name: "ApiFlux",
      base_url: withV1(input.baseUrl),
      // The key never goes into the file; Codex reads it from this env var.
      env_key: "APIFLUX_API_KEY",
      wire_api: "chat",
    };
    config.model_providers = providers;
    // A chosen model makes ApiFlux the default provider outright; without
    // one we only register the provider and let the user opt in per run.
    if (input.model !== undefined) {
      config.model = input.model;
      config.model_provider = "apiflux";
    }
    mkdirSync(join(home, ".codex"), { recursive: true });
    writeFileSync(path, stringify(config) + "\n");
    const notes = [
      `Codex CLI: wrote model_providers.apiflux to ${path}`,
      `Codex CLI: add to your shell profile: export APIFLUX_API_KEY="<your key>"`,
    ];
    notes.push(
      input.model !== undefined
        ? `Codex CLI: default model set to ${input.model} via provider apiflux`
        : `Codex CLI: select it with: codex --config model_provider=apiflux`,
    );
    return notes;
  },
};
