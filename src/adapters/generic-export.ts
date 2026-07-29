import { withV1 } from "../endpoint";
import type { Adapter, AdapterInput } from "./types";

/** Prints OpenAI-compatible export lines for any SDK/tool we have no adapter for. Touches no files. */
export const genericExportAdapter: Adapter = {
  id: "export",
  label: "Generic (print export lines)",

  detect() {
    return true;
  },

  plan() {
    return { conflicts: [] };
  },

  write(_home, input: AdapterInput) {
    const lines = [
      "Add these to your shell or .env file:",
      `export OPENAI_BASE_URL="${withV1(input.baseUrl)}"`,
      `export OPENAI_API_KEY="${input.key}"`,
    ];
    if (input.model !== undefined) {
      lines.push(`export OPENAI_MODEL="${input.model}"`);
    }
    return lines;
  },
};
