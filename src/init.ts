import type { ParsedArgs, ToolId } from "./args";
import type { Adapter } from "./adapters/types";
import { claudeCodeAdapter } from "./adapters/claude-code";
import { codexAdapter } from "./adapters/codex";
import { genericExportAdapter } from "./adapters/generic-export";
import { opencodeAdapter } from "./adapters/opencode";
import { piAdapter } from "./adapters/pi";
import { hermesAdapter } from "./adapters/hermes";
import { normalizeBaseUrl } from "./endpoint";
import { maskKeysIn } from "./mask";
import { groupModelsByMaker, type ModelGroup } from "./model-groups";
import { verifyKey, type VerifyResult } from "./verify";

// Production serves the API on the apex domain (deploy/caddy/Caddyfile @backend block);
// api.apiflux.ai does not exist.
export const DEFAULT_BASE_URL = "https://apiflux.ai";

export const ADAPTERS: Record<ToolId, Adapter> = {
  "claude-code": claudeCodeAdapter,
  codex: codexAdapter,
  opencode: opencodeAdapter,
  pi: piAdapter,
  hermes: hermesAdapter,
  export: genericExportAdapter,
};

export interface InitDeps {
  home: string;
  log: (line: string) => void;
  /** Set when the key arrived via inline --key (shell history risk). */
  keyWasInline?: boolean;
  /** Asked per conflict when --yes is absent. Defaults to rejecting. */
  confirm?: (question: string) => Promise<boolean>;
  /** Interactive model picker; undefined result skips model configuration. */
  selectModel?: (groups: ModelGroup[]) => Promise<string | undefined>;
}

export async function runInit(args: ParsedArgs, deps: InitDeps): Promise<number> {
  const { home, log } = deps;
  const key = args.key;
  if (!key || key === "-") {
    log("error: runInit requires a resolved key");
    return 1;
  }
  let baseUrl: string;
  try {
    baseUrl = normalizeBaseUrl(args.baseUrl ?? DEFAULT_BASE_URL);
  } catch (error) {
    log(`error: ${maskKeysIn(error instanceof Error ? error.message : String(error), key)}`);
    return 1;
  }

  if (deps.keyWasInline) {
    log("note: this command line contained your API key; consider clearing it from shell history (e.g. `history -d`).");
  }

  // Verification runs before writes so the model list can drive selection;
  // an invalid key still writes config (matching prior behavior) and is
  // reported at the end.
  const verified: VerifyResult | undefined = args.skipVerify
    ? undefined
    : await verifyKey(baseUrl, key);
  const availableModels = verified?.status === "ok" ? verified.models : undefined;

  let model = args.model;
  if (model !== undefined && availableModels !== undefined && !availableModels.includes(model)) {
    log(`error: model ${JSON.stringify(model)} is not available to this key; run with no --model to pick interactively.`);
    return 1;
  }
  if (model === undefined && deps.selectModel && availableModels !== undefined && availableModels.length > 0) {
    model = await deps.selectModel(groupModelsByMaker(availableModels));
  }

  const input = { baseUrl, key, model, availableModels };
  let failed = false;
  for (const toolId of args.tools) {
    const adapter = ADAPTERS[toolId];
    if (!adapter.detect(home)) {
      log(`error: ${adapter.label} not detected on this machine; skipped.`);
      failed = true;
      continue;
    }
    const { conflicts } = adapter.plan(home, input);
    if (conflicts.length > 0 && !args.yes) {
      let approved = true;
      for (const conflict of conflicts) {
        if (!(await (deps.confirm ?? (async () => false))(conflict))) {
          approved = false;
          break;
        }
      }
      if (!approved) {
        log(`skipped ${adapter.label}: existing configuration kept.`);
        continue;
      }
    }
    for (const note of adapter.write(home, input)) log(note);
  }
  if (failed) return 1;

  if (verified === undefined) {
    log("done (verification skipped).");
    return 0;
  }

  const result = verified;
  switch (result.status) {
    case "ok":
      log(`success: key verified, ${result.modelCount} model(s) available via ${baseUrl}.`);
      return 0;
    case "unauthorized":
      log("error: the API key is invalid or disabled. Config was written, but requests will fail until the key is fixed.");
      return 1;
    case "network-error":
      log(`warning: config written but unverified — could not reach ${baseUrl} (${result.message}).`);
      return 1;
  }
}
