# 06 Openclaw 适配器

Status: ready-for-agent（调研已落，2026-07-29）

从 03 占位拆出。

## 调研结论（来源：docs.openclaw.ai gateway/configuration + concepts/model-providers，实施时以源码复核）

- 配置：`~/.openclaw/openclaw.json`，**JSON5**（允许注释/尾逗号）。⚠️ 用 JSON.parse 会炸、用 JSON.stringify 回写会抹掉用户注释——需引入 json5 依赖，且回写丢注释的事实要在冲突提示里讲明。
- 自定义 provider：
  ```json5
  {
    agents: { defaults: { model: { primary: "apiflux/<model-id>" } } },
    models: {
      mode: "merge",
      providers: {
        apiflux: {
          baseUrl: "https://apiflux.ai/v1",
          apiKey: "sk-...",            // 或 "${APIFLUX_API_KEY}"
          api: "openai-completions",   // 或 "anthropic-messages"
          models: [{ id: "<id>", name: "<display>", contextWindow: 128000, maxTokens: 4096 }]
        }
      }
    }
  }
  ```
- `${VAR}` 环境变量替换：仅大写名；**变量缺失/为空时加载直接抛错**——比 OpenCode 的空串静默失败好，但 init 一次性场景下仍倾向字面量落盘。
- 默认模型：`agents.defaults.model.primary = "provider/model-id"`。

## 待实施核对项

- [ ] `models.mode: "merge"` 语义与是否必需
- [ ] detect 依据：`~/.openclaw/` 目录
- [ ] JSON5 回写策略：json5 库 stringify 不保注释——确认无更好方案（如仅在文件不存在/纯 JSON 时才接管，否则打印手动 snippet）

## 方案

- 写 `models.providers.apiflux`（openai-completions + withV1），key 字面量；选中模型写 models 数组 + `agents.defaults.model.primary`。
- 回写丢注释风险：backupOnce 已有；若检测到文件含注释，plan() 里加冲突提示。
