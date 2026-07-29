import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Document, YAMLSeq, parseDocument } from "yaml";
import { withV1 } from "../endpoint";
import type { Adapter, AdapterInput } from "./types";
import { backupOnce } from "./backup";

const KEY_ENV = "APIFLUX_API_KEY";

// Hermes resolves everything under HERMES_HOME, defaulting to ~/.hermes
// (hermes_constants.py); the adapter must honor the same override.
function hermesHome(home: string): string {
  const override = process.env.HERMES_HOME;
  if (override) return override.startsWith("~/") ? join(home, override.slice(2)) : override;
  return join(home, ".hermes");
}

interface YamlFile {
  doc: Document;
  /** Set when the file exists but is not parseable YAML. */
  unparseable: boolean;
}

function readYaml(path: string): YamlFile {
  if (!existsSync(path)) return { doc: new Document({}), unparseable: false };
  const doc = parseDocument(readFileSync(path, "utf8"));
  return doc.errors.length > 0 ? { doc: new Document({}), unparseable: true } : { doc };
}

/** Plain-JS view of the custom_providers list (for plan/inspection only). */
function customProviders(doc: Document): Record<string, unknown>[] {
  const value = doc.toJS()?.custom_providers;
  return Array.isArray(value)
    ? value.filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
    : [];
}

function isApiflux(entry: Record<string, unknown>): boolean {
  return typeof entry.name === "string" && entry.name.trim().toLowerCase() === "apiflux";
}

function apifluxEntry(input: AdapterInput): Record<string, unknown> {
  return {
    name: "ApiFlux",
    base_url: withV1(input.baseUrl),
    key_env: KEY_ENV,
    // A plain string list: Hermes refreshes it from /v1/models on its own
    // (model_switch.py) but preserves user-curated dict entries.
    models: input.availableModels ?? (input.model === undefined ? [] : [input.model]),
  };
}

/** Line-level .env upsert, mirroring Hermes's own _write_env_vars. */
function upsertEnvLine(path: string, key: string, value: string): void {
  const safeValue = value.replace(/\0/g, "").split(/\r?\n|\r/).join("");
  const lines = existsSync(path)
    ? readFileSync(path, "utf8").split("\n").filter((line, i, all) => !(line === "" && i === all.length - 1))
    : [];
  let updated = false;
  const next = lines.map((line) => {
    const name = line.includes("=") ? line.split("=", 1)[0].trim() : "";
    if (name !== key) return line;
    updated = true;
    return `${key}=${safeValue}`;
  });
  if (!updated) next.push(`${key}=${safeValue}`);
  writeFileSync(path, next.join("\n") + "\n");
  chmodSync(path, 0o600);
}

function envValueOf(path: string, key: string): string | undefined {
  if (!existsSync(path)) return undefined;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    if (line.slice(0, eq).trim() === key) return line.slice(eq + 1).trim();
  }
  return undefined;
}

export const hermesAdapter: Adapter = {
  id: "hermes",
  label: "Hermes",

  detect(home) {
    return existsSync(hermesHome(home));
  },

  plan(home, input: AdapterInput) {
    const dir = hermesHome(home);
    const conflicts: string[] = [];
    const config = readYaml(join(dir, "config.yaml"));
    if (config.unparseable) {
      conflicts.push(
        "Hermes: config.yaml is not parseable YAML; it will be left untouched and a manual snippet printed.",
      );
    } else {
      const existing = customProviders(config.doc).find(isApiflux);
      const targetUrl = withV1(input.baseUrl);
      if (existing && typeof existing.base_url === "string" && existing.base_url !== targetUrl) {
        conflicts.push(`Hermes: replace custom_providers ApiFlux base_url ${existing.base_url} → ${targetUrl}`);
      }
      if (input.model !== undefined) {
        const model = config.doc.toJS()?.model;
        const current = typeof model === "object" && model !== null ? model : {};
        if (
          typeof current.default === "string" &&
          (current.default !== input.model || current.provider !== "apiflux")
        ) {
          conflicts.push(
            `Hermes: replace default model ${current.provider ?? "auto"}/${current.default} → apiflux/${input.model}`,
          );
        }
      }
    }
    const existingKey = envValueOf(join(dir, ".env"), KEY_ENV);
    if (existingKey !== undefined && existingKey !== input.key) {
      // Never echo key values, old or new.
      conflicts.push(`Hermes: replace existing ${KEY_ENV} in .env (sk-***)`);
    }
    return { conflicts };
  },

  write(home, input: AdapterInput) {
    const dir = hermesHome(home);
    mkdirSync(dir, { recursive: true });
    const notes: string[] = [];

    const configPath = join(dir, "config.yaml");
    const config = readYaml(configPath);
    if (config.unparseable) {
      notes.push(
        `Hermes: ${configPath} is not parseable YAML; left untouched. Merge this yourself:`,
        `  custom_providers entry: ${JSON.stringify(apifluxEntry(input))}`,
      );
    } else {
      backupOnce(configPath);
      const doc = config.doc;
      const providers = doc.get("custom_providers");
      const entryNode = doc.createNode(apifluxEntry(input));
      if (providers instanceof YAMLSeq) {
        const index = customProviders(doc).findIndex(isApiflux);
        if (index >= 0) providers.set(index, entryNode);
        else providers.add(entryNode);
      } else {
        doc.set("custom_providers", doc.createNode([apifluxEntry(input)]));
      }
      if (input.model !== undefined) {
        doc.setIn(["model", "provider"], "apiflux");
        doc.setIn(["model", "default"], input.model);
      }
      writeFileSync(configPath, doc.toString());
      notes.push(`Hermes: wrote custom_providers ApiFlux to ${configPath}`);
    }

    // The key lives only in Hermes's .env (0600), referenced via key_env.
    const envPath = join(dir, ".env");
    backupOnce(envPath);
    upsertEnvLine(envPath, KEY_ENV, input.key);
    notes.push(`Hermes: wrote ${KEY_ENV} to ${envPath}`);

    notes.push(
      input.model !== undefined
        ? `Hermes: default model set to apiflux/${input.model}`
        : "Hermes: pick a model with: hermes model (provider ApiFlux)",
    );
    return notes;
  },
};
