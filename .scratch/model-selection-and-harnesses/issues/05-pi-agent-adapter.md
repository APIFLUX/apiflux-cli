# 05 Pi Agent 适配器

Status: implemented（2026-07-29 适配器+测试完成，待真机冒烟后发 minor）

从 03 占位拆出。Pi = badlogic/pi-mono（earendil-works/pi 镜像）coding agent，bin `pi`。

## 调研结论（来源：pi-mono docs/models.md + docs/providers.md，实施时以源码复核）

- 自定义 provider/模型：`~/.pi/agent/models.json`：
  ```json
  {
    "providers": {
      "apiflux": {
        "baseUrl": "https://apiflux.ai/v1",
        "api": "openai-completions",
        "apiKey": "sk-...",
        "models": [
          { "id": "<model-id>", "name": "<display>", "reasoning": false,
            "input": ["text"], "contextWindow": 128000, "maxTokens": 32000,
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 } }
        ]
      }
    }
  }
  ```
- `api` 可选 `openai-completions` / `openai-responses` / `anthropic-messages`；`apiKey` 支持字面量或 `$ENV_NAME` 引用。
- 模型条目要求全量元数据（contextWindow/maxTokens/cost）——网关 `/v1/models` 不提供，需写保守默认值。
- 默认模型：交互 `/model` 或 `--model` 旗标；**落盘持久化机制（settings.json?）文档未写清，实施时读源码确认**。
- Anthropic 兼容 compat 项（supportsStrictTools 等）仅在走 anthropic-messages 时需要，走 openai-completions 可忽略。

## 核对结论（读 badlogic/pi-mono 源码，2026-07-29）

- [x] **模型元数据全可选**：ModelDefinitionSchema 只有 `id` 必填（model-config.ts），"要求全量元数据"是过时文档误导 → models 数组只写 `{id}`。
- [x] 默认模型持久化：`~/.pi/agent/settings.json` 的 `defaultProvider` + `defaultModel`（resolver 要求两者同有且 provider 已配置鉴权，model-resolver.ts）。
- [x] key 走 pi 原生凭证库 `~/.pi/agent/auth.json`：`{"apiflux":{"type":"api_key","key":...}}`（0600/目录 0700）；provider-composer.ts 里 stored credential 优先于 models.json `apiKey` 字段（后者另支持 `$ENV`/`!命令`）。
- [x] merge：models.json 的 providers 与内置按 id 叠加，新 id `apiflux` 纯新增无冲突。
- [x] detect：`~/.pi/`；路径尊重 `PI_CODING_AGENT_DIR` 覆盖（config.ts getAgentDir）。
- [x] ⚠️ pi 读 JSON 会 strip 注释（JSONC）：适配器安全读取，解析失败不动文件、打印手动 snippet（models.json/settings.json 各自独立降级，auth.json 照写）。

## 方案

- 已实现 `src/adapters/pi.ts`：models.json 写 `providers.apiflux`（openai-completions + withV1 + 全量模型 `{id}` 列表）；auth.json 写凭证（0600）；选中模型时 settings.json 写 defaultProvider/defaultModel。
- plan() 冲突项：baseUrl 变更 / auth key 变更（脱敏）/ 默认模型变更 / JSONC 无法解析（manual merge 提示）。
- 冒烟步骤：`apiflux init --tool pi --model <id>` → 启动 pi 确认 /model 列出 ApiFlux 模型、默认模型生效、对话跑通。
