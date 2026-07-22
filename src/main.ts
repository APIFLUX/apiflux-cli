#!/usr/bin/env node
import { homedir } from "node:os";
import * as p from "@clack/prompts";
import { parseArgs, USAGE, KNOWN_TOOLS, type ParsedArgs, type ToolId } from "./args";
import { ADAPTERS, runInit } from "./init";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function resolveKey(args: ParsedArgs): Promise<{ key: string; inline: boolean }> {
  if (args.key === "-") return { key: await readStdin(), inline: false };
  if (args.key) return { key: args.key, inline: true };
  const entered = await p.password({
    message: "Paste your ApiFlux API key (sk-...)",
    validate: (value) => (value?.trim() ? undefined : "Key is required"),
  });
  if (p.isCancel(entered)) {
    p.cancel("Cancelled.");
    process.exit(1);
  }
  return { key: entered.trim(), inline: false };
}

async function resolveTools(args: ParsedArgs, home: string): Promise<ToolId[]> {
  if (args.tools.length > 0) return args.tools;
  const detected = KNOWN_TOOLS.filter((id) => ADAPTERS[id].detect(home));
  const selected = await p.multiselect({
    message: "Which tools should be configured?",
    options: detected.map((id) => ({ value: id, label: ADAPTERS[id].label })),
    initialValues: detected.filter((id) => id !== "export"),
  });
  if (p.isCancel(selected)) {
    p.cancel("Cancelled.");
    process.exit(1);
  }
  return selected as ToolId[];
}

async function main(): Promise<number> {
  let args: ParsedArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
  if (args.command === "help") {
    console.log(USAGE);
    return 0;
  }

  p.intro("ApiFlux setup");
  const home = homedir();
  const { key, inline } = await resolveKey(args);
  const tools = await resolveTools(args, home);

  const code = await runInit(
    { ...args, key, tools },
    {
      home,
      log: (line) => p.log.message(line),
      keyWasInline: inline,
      confirm: async (question) => {
        const answer = await p.confirm({ message: question });
        return !p.isCancel(answer) && answer;
      },
    },
  );
  p.outro(code === 0 ? "All set." : "Finished with warnings — see messages above.");
  return code;
}

main().then((code) => process.exit(code));
