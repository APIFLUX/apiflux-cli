# 03 第二批 Harness：Pi Agent / OpenCode / Openclaw / Hermes

Status: in-progress（2026-07-29 调研完成，已拆出 04–07）

## 口径（已拍板）

- 逐个走完：配置格式调研 → 适配器 + 测试 → 真机冒烟 → 单独发 minor 版本；互不阻塞。
- 每个实施前从本占位拆出独立 issue，先落调研结论（配置文件路径、字段、协议、是否支持自定义 base URL）再写代码。
- 顺序按调研难度与用户量权衡，实施时定。

## 清单

- [x] Pi Agent → `05-pi-agent-adapter.md`（适配器已实现，待冒烟发版）
- [x] OpenCode → `04-opencode-adapter.md`（适配器已实现，待冒烟发版）
- [ ] Openclaw → `06-openclaw-adapter.md`
- [x] Hermes → `07-hermes-adapter.md`（适配器已实现，venv 冒烟通过，待发版）

调研结论（2026-07-29）：四个都支持自定义 OpenAI 兼容 base URL，无 wontfix 候选；难点分布——OpenCode（纯 JSON，最顺）＜ Pi（模型需全量元数据）＜ Hermes（YAML+.env 两文件）＜ Openclaw（JSON5 回写丢注释风险）。
