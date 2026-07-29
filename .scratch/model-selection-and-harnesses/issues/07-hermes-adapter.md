# 07 Hermes 适配器

Status: implemented（2026-07-29 适配器+测试完成，scratchpad venv 隔离冒烟通过，待发 minor）

从 03 占位拆出。Hermes = NousResearch/hermes-agent（Python），bin `hermes`。

## 核对结论（读 NousResearch/hermes-agent 源码，2026-07-29）

- **路径**：home = `HERMES_HOME` 环境变量 → 否则 `~/.hermes`（hermes_constants.py）；配置 `~/.hermes/config.yaml`；密钥 `~/.hermes/.env`（.env 优先于 config.yaml 内联 api_key）。
- **重大发现：不走 `model.provider: custom` 泛型路径，走 `custom_providers:` 命名列表**（providers.py `resolve_custom_provider`）：
  ```yaml
  custom_providers:
    - name: "ApiFlux"
      base_url: "https://apiflux.ai/v1"
      key_env: "APIFLUX_API_KEY"
      models: [deepseek-v4-pro, kimi-k2.6, ...]   # 纯字符串列表
  model:
    provider: "apiflux"        # display_name 小写或 "custom:apiflux" 均可匹配
    default: "<裸模型 id>"
  ```
  - transport 固定 `openai_chat`；`key_env` 指定的环境变量做鉴权 → **完全避开 OPENAI_API_KEY 撞名**（泛型 custom 路径会撞）。
  - `models` 为纯字符串列表时 hermes 会在 /v1/models 探测成功后自己刷新缓存（model_switch.py `_save_discovered_models_to_config` 只替换纯字符串列表、保留用户手工 curated 的 dict 形式）→ 我们写全量 id 列表既有开箱模型又保持可刷新。
- **.env 写入格式**（照抄 hermes 自己的 `_write_env_vars`，memory_setup.py）：逐行 `KEY=value`（无引号、值内换行剥除）、保留其他行、更新同名行、0600。写 `APIFLUX_API_KEY=sk-...`。
- **注释问题**：hermes 自己的 save_config 用 yaml.safe_dump 重生成，不保用户注释 → 我们用 npm `yaml` 包 Document API 回写（保注释），比官方行为更好，无需降级路径。
- detect：`~/.hermes/`（或 HERMES_HOME 指向的目录）。

## 方案（待实施）

- 写 `config.yaml`：`custom_providers` 数组 merge（按 name=ApiFlux 匹配更新/追加）+ 选中模型时置 `model.provider: apiflux` + `model.default: <id>`；`yaml` Document API 保注释。
- 写 `.env`：`APIFLUX_API_KEY` 行级 upsert，0600。
- plan() 冲突：base_url 变更 / model.provider|default 变更 / .env 已有不同 APIFLUX_API_KEY（脱敏）。
- 验证（2026-07-29 已过）：单测 14 例 + **scratchpad venv 隔离冒烟**（hermes-agent 0.19.0 / PyPI + HERMES_HOME 指向 scratchpad）：默认模型 one-shot（`hermes -z`）与 `--provider apiflux --model claude-haiku-4-5` 两发 SMOKE-OK；冒烟目录（含 key）已删。
- ⚠️ 冒烟发现：hermes 裸 `--model <id>`（无 --provider）可能撞别家 catalog 同名模型（实测撞到 opencode-zen）——需要显式指定时用 `--provider apiflux`；默认模型路径（config.yaml）不受影响。
- 附注：hermes-agent 源码目录禁止非 editable 安装（uv pip install 目录会拒绝），从 PyPI 装即可。
