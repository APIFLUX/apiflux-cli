import type { ToolId } from "../args";

export interface AdapterInput {
  baseUrl: string;
  key: string;
  /** Default model to configure; absent = keep each tool's own default. */
  model?: string;
}

export interface AdapterPlan {
  /** Human-readable descriptions of settings that would be overwritten. Never contains key material. */
  conflicts: string[];
}

export interface Adapter {
  id: ToolId;
  label: string;
  detect(home: string): boolean;
  plan(home: string, input: AdapterInput): AdapterPlan;
  /** Applies the config. Returns lines to print to the user (post-write instructions). */
  write(home: string, input: AdapterInput): string[];
}
