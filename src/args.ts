export const KNOWN_TOOLS = ["claude-code", "codex", "opencode", "pi", "export"] as const;
export type ToolId = (typeof KNOWN_TOOLS)[number];

export interface ParsedArgs {
  command: "init" | "help";
  key: string | undefined;
  baseUrl: string | undefined;
  model: string | undefined;
  tools: ToolId[];
  yes: boolean;
  skipVerify: boolean;
}

export const USAGE = `usage: apiflux init [options]

options:
  --key <key|->     API key (use "-" to read from stdin; omit for hidden prompt)
  --base-url <url>  Override the ApiFlux API origin
  --model <id>      Default model to configure in each tool (must be usable by the key)
  --tool <id>       Configure only this tool (repeatable): ${KNOWN_TOOLS.join(", ")}
  --yes             Skip confirmations (overwrite conflicting config)
  --skip-verify     Do not send the verification request
  --help            Show this help
`;

class UsageError extends Error {}

export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    command: "help",
    key: undefined,
    baseUrl: undefined,
    model: undefined,
    tools: [],
    yes: false,
    skipVerify: false,
  };

  const [first, ...rest] = argv;
  if (first === undefined || first === "--help" || first === "help") return parsed;
  if (first !== "init") throw new UsageError(`Unknown command ${JSON.stringify(first)}\n\n${USAGE}`);
  parsed.command = "init";

  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    const takeValue = (): string => {
      const value = rest[++i];
      if (value === undefined) throw new UsageError(`Missing value for ${flag}\n\n${USAGE}`);
      return value;
    };
    switch (flag) {
      case "--key":
        parsed.key = takeValue();
        break;
      case "--base-url":
        parsed.baseUrl = takeValue();
        break;
      case "--model":
        parsed.model = takeValue();
        break;
      case "--tool": {
        const tool = takeValue();
        if (!(KNOWN_TOOLS as readonly string[]).includes(tool)) {
          throw new UsageError(`Unknown tool ${JSON.stringify(tool)}; known tools: ${KNOWN_TOOLS.join(", ")}`);
        }
        parsed.tools.push(tool as ToolId);
        break;
      }
      case "--yes":
        parsed.yes = true;
        break;
      case "--skip-verify":
        parsed.skipVerify = true;
        break;
      case "--help":
        parsed.command = "help";
        break;
      default:
        throw new UsageError(`Unknown option ${JSON.stringify(flag)}\n\n${USAGE}`);
    }
  }
  return parsed;
}
