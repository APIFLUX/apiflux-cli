# 07 Hermes 适配器

Status: ready-for-agent（调研已落，2026-07-29）

从 03 占位拆出。Hermes = NousResearch/hermes-agent，bin `hermes`。

## 调研结论（来源：hermes-agent 官方 docs + cli-config.yaml.example，实施时以源码复核）

- 配置：`~/.hermes/config.yaml`（YAML，需引入 yaml 依赖）；密钥在 `~/.hermes/.env`（.env 优先于 config.yaml 里的 api_key 字段）。
- 自定义 OpenAI 兼容端点：
  ```yaml
  model:
    provider: custom            # 也可留 auto，由 base_url 覆盖
    default: <model-id>
    base_url: "https://apiflux.ai/v1"
    # api_key: 'sk-...'         # 可写这里；官方推荐 .env
  ```
- custom 端点默认用 `OPENAI_API_KEY` 鉴权（读 `~/.hermes/.env`，作用域仅 Hermes，不污染 shell）。
- 默认模型：`model.default`；改后需重启。`hermes model` 有交互选择器。
- 内置 provider 的模型名带 `provider/` 前缀（如 anthropic/claude-*）；custom 端点下 model id 直接用裸 id——实施时以源码确认。

## 待实施核对项

- [ ] `provider: custom` 与 `base_url` 覆盖的确切关系（cli-config.yaml.example + 源码）
- [ ] `~/.hermes/.env` 写 `OPENAI_API_KEY` 是否被 custom 路径读取（与 config.yaml api_key 字段二选一）
- [ ] api_mode 字段是否存在/必需（docs 两页说法不一）
- [ ] detect 依据：`~/.hermes/` 目录
- [ ] YAML 回写保注释问题：yaml 库（eemeli/yaml）支持 CST 级别保注释，验证可行性

## 方案

- 写 `~/.hermes/config.yaml` 的 model 段（provider/default/base_url）+ `~/.hermes/.env` 写 `OPENAI_API_KEY`（Hermes 私有目录，等价于 key 落盘但不进 shell 环境）。
- plan() 冲突项：已有不同 base_url/provider/default；.env 已有 OPENAI_API_KEY。
