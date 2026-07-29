# 06 Openclaw 适配器

Status: implemented（2026-07-29 适配器+测试完成，Docker 隔离冒烟通过，待发 minor）

从 03 占位拆出。

## 核对结论（读 openclaw/openclaw 源码，2026-07-29）

- **路径**：state dir = `OPENCLAW_STATE_DIR` → 否则 `~/.openclaw`；配置 = `OPENCLAW_CONFIG_PATH` → 否则 `<state>/openclaw.json`（src/config/paths.ts）。JSON5（支持注释、`$include`、`${VAR}` 环境变量替换）。
- **注释问题解除**：openclaw 自己的 io.write.ts 就是 `JSON.stringify(...,null,2)` 落盘 + `warnIfJSON5CommentsWillBeStripped` 警告——官方回写也抹注释。我们用 json5 parse + JSON stringify 回写不比官方差；plan() 检测到注释时照样给提示。
  - ⚠️ 例外：raw 含 `$include` 时不可回写（会把 include 内联展开）→ 降级为手动 snippet。
- **schema**（src/config/types.models.ts + docs/concepts/model-providers.md）：
  ```json5
  {
    agents: { defaults: { model: { primary: "apiflux/<model-id>" } } },
    models: {
      providers: {
        apiflux: {
          baseUrl: "https://apiflux.ai/v1",
          apiKey: "sk-...",           // SecretInput：字面量即官方 Control UI 的存法
          api: "openai-completions",
          models: [{ id: "<id>", name: "<id>" }]   // 官方文档示例即最小 {id,name}
        }
      }
    }
  }
  ```
  - TS 类型里模型的 reasoning/cost/contextWindow/maxTokens 标必填是**物化后**形状；运行时 provider-model-helpers.ts 会补默认值，官方 Moonshot 示例就只写 `{id, name}`。
  - `models.mode` 默认即 merge（源码只特判 `"replace"`）→ **不写 mode 字段**，避免覆盖用户已设的 replace。
  - `${VAR}` 替换缺变量时加载抛错 → 不用环境变量引用，apiKey 字面量落盘（与 Control UI 行为一致；openclaw 回写时对已有 `${VAR}` 有 env-preserve 机制，不会破坏用户其他 provider 的引用）。
- 默认模型：`agents.defaults.model.primary = "apiflux/<id>"`（接受 string 或 {primary,fallbacks}——已有 fallbacks 对象时只改 primary）。
- detect：`~/.openclaw/`（或 OPENCLAW_STATE_DIR）。

## 方案（待实施）

- json5 依赖读（容注释）、`models.providers.apiflux` merge 回写（全量模型 `{id,name}`）、选中模型时置 `agents.defaults.model.primary`。
- plan() 冲突：baseUrl 变更 / apiKey 变更（脱敏）/ primary 变更 / 原文件含注释（提示将被抹掉，同官方行为）/ 含 `$include`（降级手动 snippet）。
- 验证（2026-07-29 已过）：单测 16 例 + **Docker 隔离冒烟**（ghcr.io/openclaw/openclaw:latest，挂载隔离 state dir）：`openclaw agent --local` 默认模型与 `--model apiflux/claude-haiku-4-5` 两发 SMOKE-OK，日志确认打到 apiflux.ai /v1/chat/completions 200；冒烟目录（含 key）已删。
- ⚠️ Docker 冒烟坑：宿主目录必须在 Docker Desktop 文件共享列表内（/private/tmp 不在，bind 会静默落到 VM 空目录）；容器内以 --user root -e HOME=/root 挂 /root/.openclaw 最省事。
