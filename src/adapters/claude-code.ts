import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Adapter, AdapterInput } from "./types";
import { backupOnce } from "./backup";

function settingsPath(home: string): string {
  return join(home, ".claude", "settings.json");
}

function readSettings(home: string): Record<string, unknown> {
  const path = settingsPath(home);
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8"));
}

function envOf(settings: Record<string, unknown>): Record<string, unknown> {
  return typeof settings.env === "object" && settings.env !== null
    ? (settings.env as Record<string, unknown>)
    : {};
}

export const claudeCodeAdapter: Adapter = {
  id: "claude-code",
  label: "Claude Code",

  detect(home) {
    return existsSync(join(home, ".claude"));
  },

  plan(home, input: AdapterInput) {
    const env = envOf(readSettings(home));
    const conflicts: string[] = [];
    const existingUrl = env.ANTHROPIC_BASE_URL;
    if (typeof existingUrl === "string" && existingUrl !== input.baseUrl) {
      conflicts.push(`Claude Code: replace ANTHROPIC_BASE_URL ${existingUrl} → ${input.baseUrl}`);
    }
    const existingToken = env.ANTHROPIC_AUTH_TOKEN;
    if (typeof existingToken === "string" && existingToken !== input.key) {
      // Never echo token values, old or new.
      conflicts.push("Claude Code: replace existing ANTHROPIC_AUTH_TOKEN (sk-***)");
    }
    return { conflicts };
  },

  write(home, input: AdapterInput) {
    const path = settingsPath(home);
    backupOnce(path);
    const settings = readSettings(home);
    settings.env = {
      ...envOf(settings),
      ANTHROPIC_BASE_URL: input.baseUrl,
      ANTHROPIC_AUTH_TOKEN: input.key,
    };
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(path, JSON.stringify(settings, null, 2) + "\n");
    return [`Claude Code: wrote env to ${path}`];
  },
};
