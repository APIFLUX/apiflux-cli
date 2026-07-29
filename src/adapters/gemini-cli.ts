import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Adapter, AdapterInput } from "./types";
import { backupOnce } from "./backup";

// Gemini CLI auto-loads ~/.gemini/.env; GOOGLE_GEMINI_BASE_URL feeds
// httpOptions.baseUrl of the GoogleGenAI client (gemini-cli contentGenerator).
function envFilePath(home: string): string {
  return join(home, ".gemini", ".env");
}

function readEnvFile(home: string): Map<string, string> {
  const entries = new Map<string, string>();
  const path = envFilePath(home);
  if (!existsSync(path)) return entries;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (match) entries.set(match[1]!, match[2]!.replace(/^"|"$/g, ""));
  }
  return entries;
}

function targetEntries(input: AdapterInput): Map<string, string> {
  const entries = new Map<string, string>([
    ["GOOGLE_GEMINI_BASE_URL", input.baseUrl],
    ["GEMINI_API_KEY", input.key],
  ]);
  if (input.model !== undefined) entries.set("GEMINI_MODEL", input.model);
  return entries;
}

export const geminiCliAdapter: Adapter = {
  id: "gemini-cli",
  label: "Gemini CLI",

  detect(home) {
    return existsSync(join(home, ".gemini"));
  },

  plan(home, input: AdapterInput) {
    const existing = readEnvFile(home);
    const conflicts: string[] = [];
    const existingUrl = existing.get("GOOGLE_GEMINI_BASE_URL");
    if (existingUrl !== undefined && existingUrl !== input.baseUrl) {
      conflicts.push(`Gemini CLI: replace GOOGLE_GEMINI_BASE_URL ${existingUrl} → ${input.baseUrl}`);
    }
    const existingKey = existing.get("GEMINI_API_KEY");
    if (existingKey !== undefined && existingKey !== input.key) {
      // Never echo key values, old or new.
      conflicts.push("Gemini CLI: replace existing GEMINI_API_KEY (sk-***)");
    }
    const existingModel = existing.get("GEMINI_MODEL");
    if (input.model !== undefined && existingModel !== undefined && existingModel !== input.model) {
      conflicts.push(`Gemini CLI: replace GEMINI_MODEL ${existingModel} → ${input.model}`);
    }
    return { conflicts };
  },

  write(home, input: AdapterInput) {
    const path = envFilePath(home);
    backupOnce(path);
    const target = targetEntries(input);
    const kept = existsSync(path)
      ? readFileSync(path, "utf8")
          .split("\n")
          .filter((line) => {
            const match = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line.trim());
            return !(match && target.has(match[1]!));
          })
          .join("\n")
          .replace(/\n+$/, "")
      : "";
    const managed = Array.from(target, ([name, value]) => `${name}="${value}"`).join("\n");
    mkdirSync(join(home, ".gemini"), { recursive: true });
    writeFileSync(path, (kept ? kept + "\n" : "") + managed + "\n");
    return [`Gemini CLI: wrote ${path}`];
  },
};
