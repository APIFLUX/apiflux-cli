export interface ModelGroup {
  label: string;
  models: string[];
}

// Display grouping only: the CLI has no catalog metadata, so maker is
// inferred from the id prefix; unknown ids stay selectable under "Other".
const MAKER_PREFIXES: [label: string, prefixes: string[]][] = [
  ["Anthropic", ["claude-"]],
  ["OpenAI", ["gpt-"]],
  ["Google", ["gemini-"]],
  ["DeepSeek", ["deepseek-"]],
  ["MoonshotAI", ["kimi-"]],
  ["Z.ai", ["glm-"]],
  ["Alibaba Qwen", ["qwen"]],
];

export function groupModelsByMaker(models: string[]): ModelGroup[] {
  const unique = Array.from(new Set(models));
  const grouped = new Set<string>();
  const groups: ModelGroup[] = [];
  for (const [label, prefixes] of MAKER_PREFIXES) {
    const members = unique.filter((model) =>
      prefixes.some((prefix) => model.toLowerCase().startsWith(prefix)),
    );
    if (members.length > 0) {
      groups.push({ label, models: members });
      for (const member of members) grouped.add(member);
    }
  }
  const other = unique.filter((model) => !grouped.has(model));
  if (other.length > 0) groups.push({ label: "Other", models: other });
  return groups;
}
