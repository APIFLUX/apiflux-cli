# Spec：CLI 模型选择 + Gemini CLI 适配器（第一批）

日期：2026-07-29
Status: ready-for-agent
关联：Web 弹窗侧 spec 见 `apiflux-web/.scratch/onekey-all-models/PRD.md`；第二批 Harness 扩张见 `issues/03-batch2-harnesses.md`（本 spec 不含）

## Problem Statement

终端用户用 `npx apiflux-cli init` 接入后，CLI 只写了网关地址和 Key，模型用的是各工具自带默认值。买了 DeepSeek/Kimi/GLM/Qwen 额度的用户接入 Claude Code 后发的第一条消息就失败——默认的 Claude 模型不在他的 Key 里；他也没有任何途径在接入流程里声明"我要用哪个模型"。同时 Gemini CLI 用户完全没有适配器可用。

## Solution

init 流程在验证 Key 后拉取该 Key 可用模型列表，终端交互让用户选一个默认模型（可跳过），脚本场景用 `--model` 旗标直接指定；写入 Claude Code 时非 Claude 模型同时设置主模型与小快模型，杜绝后台任务 403。同批新增 Gemini CLI 适配器，凑齐三大 Harness，与 Web 弹窗改造同步发布。

## User Stories

1. As a 终端用户, I want init 验证 Key 后让我从可用模型里选默认模型, so that 接入完成后第一条消息就能用我买的模型。
2. As a 终端用户, I want 模型列表按制造商归组展示, so that 我在几十个模型里能快速定位。
3. As a 终端用户, I want 选择器默认停在目标 Harness 原生系列的最新模型, so that 直接回车就是最稳妥的组合。
4. As a 终端用户, I want 可以显式跳过模型选择, so that 我能保持工具自带默认值的现状行为。
5. As a 脚本/CI 作者, I want `--model <id>` 旗标, so that 非交互环境也能完成带模型的一键接入。
6. As a 非 TTY 环境用户, I want 未传 `--model` 时自动跳过模型选择而不是挂起等输入, so that 管道/脚本调用不会卡死。
7. As a 用 DeepSeek 模型接入 Claude Code 的用户, I want 后台小任务也走我选的模型, so that 不会因 Key 无 Claude 权限出现莫名 403。
8. As a Gemini CLI 用户, I want `apiflux init` 支持我的工具, so that 我也能一键接入 ApiFlux。
9. As a Gemini CLI 用户, I want 接入时同样能选任意系列模型, so that 三大 Harness 的模型自由度一致。
10. As a 已有自定义配置的用户, I want 覆盖前看到冲突清单并确认, so that 我的既有配置不会被静默改掉。
11. As a 终端用户, I want 所有错误输出里 Key 被脱敏, so that 复制报错求助时不泄露凭据。
12. As a 选了 Key 之外模型 ID 的脚本作者, I want `--model` 传入不在 `/v1/models` 列表内的值时得到明确报错, so that 拼写错误在接入时暴露而不是首次调用时。
13. As an ApiFlux 维护者, I want 新能力只依赖 Key 鉴权端点, so that key-only 红线（ADR-0001）不被突破。
14. As an ApiFlux 维护者, I want 本批与 Web 弹窗改造同步发布, so that 对外能讲完整的"三大 Harness × 全系列模型"故事。

## Implementation Decisions

- **模型获取走 `/v1/models`**（verify 已在用的 Key 鉴权端点），不新增后端端点，符合 key-only 红线。
- **归组按模型 ID 前缀推导**（claude/gpt/gemini/deepseek/kimi/glm/qwen → 七家制造商，未识别归 Other）；CLI 不读网站模型资料，也不读 `harnessExclude`——CLI 全开，坏组合走网站 support，根治靠修网关。
- **选择优先级**：`--model` 旗标 > TTY 交互选择 > 跳过（不写模型）。`--model` 值必须出现在 `/v1/models` 返回中，否则报错退出。
- **Claude Code 写入规则**：非 `claude-*` 模型写 `ANTHROPIC_MODEL` + `ANTHROPIC_SMALL_FAST_MODEL`（同值）；`claude-*` 只写 `ANTHROPIC_MODEL`。Codex 在既有 provider 配置上补默认模型字段（具体字段名实施时按 Codex 官方文档核实）。generic-export 输出附带模型。
- **交互能力通过现有依赖注入点扩展**：init 编排的注入依赖新增一个 prompt 函数，作为唯一新测试缝。
- **Gemini CLI 适配器**与既有适配器同构（detect / conflicts / write），配置机制（环境变量 vs settings 文件）实施前先调研官方文档与源码并把结论记入 issue，再动手。
- **conflicts 检测扩展**：目标位置已有不同模型配置时列入确认清单，`--yes` 语义不变。
- **发版**：两包 lockstep（bump 两个 package.json + 打 tag），推送走 SSH remote；机制中立/路线图不中立——不收其他 provider 的 preset PR。

## Testing Decisions

- **主测试缝（现有）**：init 编排函数 + 临时 HOME 目录 + 本地真实 HTTP 假网关（返回可控的 `/v1/models` 列表）。断言只看外部行为：进程退出码、日志输出、落盘配置文件内容。
- **新缝仅一个**：注入的 prompt 假实现，模拟用户在选择器中的选择/跳过。
- 覆盖场景：`--model` 直指并落盘；`--model` 不在列表内时报错；非 TTY 未传旗标时跳过；交互选择后落盘；非 Claude 模型双环境变量、Claude 模型单变量；Gemini CLI 适配器 detect/conflicts/write；conflicts 清单含模型项；错误输出 Key 脱敏。
- 先行范例：现有 init 端到端测试（bun:test + `Bun.serve` 假网关 + mkdtemp 临时 HOME）与各适配器测试，完全沿用同套路。
- 真机冒烟（装真实工具跑首条对话 + 工具调用）为人工验收，结果记入 apiflux-web 冒烟矩阵 issue。

## Out of Scope

- 第二批 Harness（Pi Agent / OpenCode / Openclaw / Hermes）——占位 issue 已建，逐个调研后独立发 minor。
- 任何账号/登录态能力（key-only 红线；SSO 需求另立项走 OAuth device flow）。
- CLI 侧兼容过滤（`harnessExclude`）与对应后端元数据端点。
- 其他 provider 的 preset。
- 模型推荐/智能默认之外的任何模型管理能力（列表来自网关，CLI 不维护模型知识库）。

## Further Notes

- 实现 issue 已拆：`issues/01`（模型选择器 + 旗标 + 适配器写模型）、`issues/02`（Gemini CLI 适配器）；`issues/03` 为第二批占位。
- 决策来源：2026-07-29 grilling 会话（与 Web 侧同场拍板）；领域术语见 apiflux-web `docs/CONTEXT.md`（Harness、一键导入）。
