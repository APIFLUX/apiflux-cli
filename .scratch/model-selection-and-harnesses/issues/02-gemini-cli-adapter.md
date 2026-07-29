# 02 Gemini CLI 适配器

Status: needs-info（第一批；先落配置机制调研结论再实现）

## 要做什么

1. 调研 Gemini CLI 的自定义 base URL / API key 配置机制（环境变量 vs settings 文件；`GOOGLE_GEMINI_BASE_URL` / `GEMINI_API_KEY` 等，以官方文档与源码为准，写进本 issue 再动手）。
2. 新增 `src/adapters/gemini-cli.ts`：detect / conflicts / write，模式对齐 claude-code 适配器；支持模型选择（issue 01）。
3. 真机冒烟：装 Gemini CLI，用真实 Key 跑通首条对话 + 工具调用（gemini 模型与非 gemini 模型各一）。

## 验收

- bun test 覆盖 detect/conflicts/write。
- 冒烟结果记入 apiflux-web `onekey-all-models/issues/04-smoke-matrix.md`。
