# 05 Pi Agent 适配器

Status: ready-for-agent（调研已落，2026-07-29）

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

## 待实施核对项

- [ ] 默认模型持久化位置（~/.pi/agent/settings.json?）
- [ ] models.json 与内置 provider 的 merge 语义（同名覆盖？）
- [ ] detect 依据：`~/.pi/` 目录

## 方案

- 写 `providers.apiflux`（openai-completions + withV1），key 字面量；仅写入用户选中的模型（不同步全目录），contextWindow/maxTokens 用保守默认（128k/32k），cost 全 0（网关侧计费，本地显示不作数——README 注明）。
- 未选模型时的行为：Pi 要求 models 数组非空才有意义，倾向「未选模型则提示必须 --model / 交互选择」——实施时定。
