# 04 OpenCode 适配器

Status: implemented（2026-07-29 适配器+测试完成，待真机冒烟后发 minor）

从 03 占位拆出。

## 调研结论（来源：opencode.ai/docs/config + docs/providers，实施时以 sst/opencode 源码复核）

- 全局配置：`~/.config/opencode/opencode.json`（JSON，带 `$schema: https://opencode.ai/config.json`）。
- 自定义 provider：
  ```json
  {
    "provider": {
      "apiflux": {
        "npm": "@ai-sdk/openai-compatible",
        "name": "ApiFlux",
        "options": { "baseURL": "https://apiflux.ai/v1", "apiKey": "sk-..." },
        "models": { "<model-id>": { "name": "<display>" } }
      }
    }
  }
  ```
- Key 三种给法：`/connect` 存 `~/.local/share/opencode/auth.json`；`options.apiKey` 字面量；`{env:VAR}` 替换（变量缺失时替换为**空串**，静默失败，不适合我们）。
- 默认模型：根级 `"model": "apiflux/<model-id>"`（`provider/model` 格式）；另有 `small_model` 可选。
- 模型必须在 `models` map 里声明才会出现在 `/models` 选择器。

## 核对结论（读 sst/opencode 源码，2026-07-29）

- [x] key 走原生凭证库 `auth.json`（`$XDG_DATA_HOME/opencode/auth.json`，默认 `~/.local/share/opencode/`，0600）：格式 `{"apiflux":{"type":"api","key":"sk-..."}}`；provider.ts:1715 在 `options.apiKey` 未设时自动把 auth key 落成 apiKey——绕开 issue #5674 的 options 透传疑虑，且 key 不进 opencode.json。注意 config 里的 `options.apiKey` 优先级更高，plan() 对残留的 stale apiKey 报冲突。
- [x] detect：opencode 启动时无条件 mkdir data/config 两个目录（core/global.ts）——任一存在即视为已安装；路径走 xdg-basedir，适配器同样尊重 `XDG_CONFIG_HOME`/`XDG_DATA_HOME`。
- [x] 模型声明：按"默认全开"口径把 key 可用的全部模型写进 `provider.apiflux.models`（AdapterInput 新增 `availableModels`，由 verify 的 /v1/models 结果传入）；skip-verify 时退化为仅选中模型。

## 方案

- 已实现 `src/adapters/opencode.ts`：opencode.json 写 provider（merge 保留其他 provider）+ 全量模型；auth.json 写 key（0600）；选中模型时置根级 `model: "apiflux/<id>"`。
- plan() 冲突项：baseURL 变更 / 根级 model 变更 / auth.json 已有不同 key（脱敏）/ config 里残留 stale `options.apiKey`。
- 冒烟步骤：`apiflux init --tool opencode --model <id>` → 打开 opencode 确认 /models 列出 ApiFlux 全量模型、默认模型生效、对话跑通。
