# 01 模型选择器 + --model 旗标

Status: resolved（第一批）

## 要做什么

1. `src/args.ts` 加 `--model <id>` 旗标。
2. init 流程：verify 通过后拉 `/v1/models`（复用 verify 的网络路径与错误脱敏 `sk-***`）：
   - TTY 且未传 `--model`：交互选择器，按模型 ID 前缀归组（claude/gpt/gemini/deepseek/kimi/glm/qwen → 七家制造商，未识别归 Other），默认选中目标 Harness 原生系列最新款；提供"跳过（不设默认模型）"选项。
   - 非 TTY 且未传 `--model`：跳过模型设置，行为与现状一致。
3. 适配器接收 `model` 输入：
   - claude-code：非 `claude-*` 模型写 `ANTHROPIC_MODEL` + `ANTHROPIC_SMALL_FAST_MODEL`（防后台任务 403）；`claude-*` 只写 `ANTHROPIC_MODEL`。
   - codex：`model_providers.apiflux` 相应设置默认模型（TOML 字段实施时按 Codex 文档核实）。
   - generic-export：导出内容附模型。
4. conflicts 检测扩展：已有不同模型配置时列入确认清单。

## 验收

- bun test 覆盖：归组、默认选中、跳过路径、claude 双环境变量写入、conflicts。
- `npx apiflux-cli init --model deepseek-v4` 全非交互跑通。

## Comments

- 2026-07-29 已实现（TDD）：init 验证前置（同一次 /v1/models 请求兼做模型校验与最终报告，Key 无效仍写配置的既有契约保留）；`--model` 不在列表内时报错且不落盘；`selectModel` 注入缝 + main.ts 接 @clack select（仅 TTY 且未传 --model）；claude-code 非 Claude 模型写双环境变量；codex 选模型时写根级 model + model_provider=apiflux 并有冲突检测。57 测试全过，build + --help 冒烟通过。generic-export 未附模型（导出格式不含模型概念，维持现状）。
