# 02 Gemini CLI 适配器

Status: ready-for-agent（第一批；调研结论已落，见 Comments）

## 要做什么

1. 调研 Gemini CLI 的自定义 base URL / API key 配置机制（环境变量 vs settings 文件；`GOOGLE_GEMINI_BASE_URL` / `GEMINI_API_KEY` 等，以官方文档与源码为准，写进本 issue 再动手）。
2. 新增 `src/adapters/gemini-cli.ts`：detect / conflicts / write，模式对齐 claude-code 适配器；支持模型选择（issue 01）。
3. 真机冒烟：装 Gemini CLI，用真实 Key 跑通首条对话 + 工具调用（gemini 模型与非 gemini 模型各一）。

## 验收

- bun test 覆盖 detect/conflicts/write。
- 冒烟结果记入 apiflux-web `onekey-all-models/issues/04-smoke-matrix.md`。

## Comments

- 2026-07-29 配置机制调研（官方文档 + 上游 PR）：
  - **API Key**：`GEMINI_API_KEY` 环境变量；`~/.gemini/.env` 会被 CLI 自动加载（官方文档明示，适合落盘不污染 shell profile）；`settings.json` 的 `security.auth.selectedType` 需设为 API key 模式。
  - **Base URL**：官方配置文档未列，但上游已合并支持——候选环境变量 `GOOGLE_GEMINI_BASE_URL`（PR #2899，LiteLLM/TrueFoundry 等网关教程均用此变量）与 `GEMINI_API_BASE_URL`（PR #6380，经 httpOptions 注入 GoogleGenAI client）。**实现时须对当前发布版源码核实生效的变量名**（可能两者并存不同版本），必要时两个都写。
  - **默认模型**：`GEMINI_MODEL` 环境变量或 `settings.json` 的 `model.name`。
  - 适配器落点：detect `~/.gemini/`；写 `~/.gemini/.env`（BASE_URL + GEMINI_API_KEY + 可选 GEMINI_MODEL），conflicts 检测既有不同值；真机冒烟确认 auth type 是否需要显式写 settings.json。
  - 来源：官方配置文档 google-gemini.github.io/gemini-cli/docs/get-started/configuration.html；PR google-gemini/gemini-cli#2899、#6380、#6748。
