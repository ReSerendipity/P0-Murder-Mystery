# 架构 — P0-Murder-Mystery

> 治理定位：`delivery=service`、`lifecycle=maintenance`（`governance/desired-state.json`）。
> 本文按 2026-11-03 的实际目录结构生成；数据流与边界须由维护者在实现变更时同步复核。

## 1. 定位

一个 Galgame 式的单文件文字推理游戏：审 9 名 AI Agent、翻 17 条互相矛盾的线索、在倒计时归零前指按下清空键的那个人。13 个结局，选错就是别人的锅。

## 2. 组件与依赖方向

```text
应用层：src/ (5)
资产层：assets/ (11)
支撑层：docs/ (16)、.github/ (3)
根级层：根级文件 (7)
```

| 组件 | 目录 | 文件数 | 代表文件 |
|---|---|---|---|
| `docs` | `docs/` | 16 | `docs/PLAYTEST-REPORT.md`, `docs/agent-contract.md`, `docs/assets/readme-p0-murder-mystery-1.png` |
| `assets` | `assets/` | 11 | `assets/portraits/chatgpt.webp`, `assets/portraits/claude.webp`, `assets/portraits/deepseek.webp` |
| 根级文件 | `/` | 7 | `.editorconfig`, `.gitignore`, `LICENSE` |
| `src` | `src/` | 5 | `src/data.js`, `src/engine.js`, `src/scenes.js` |

依赖方向：入口层（应用 / 页面）调用领域层（业务模块），领域层依赖基础设施层（脚本、配置、模型资产）；反向引用不允许。

## 3. 数据流

加载剧本与线索数据 → 玩家审问与选择 → 倒计时内判定结局。

## 4. 外部依赖

| 依赖 | 用途 | 不可用时 |
|---|---|---|
| 浏览器 | 单文件运行 | 无 JS 则不可玩 |

## 5. 边界与非目标

- 不承担其他仓的职责；跨仓协作只走文档与接口约定。
- 运行时不把密钥写入仓库或日志。
- 不入库：密钥 / token / 口令 / 连接串、本机绝对路径、`local/` 与 `AGENTS.md`、构建产物。
- 治理正文只在 `ReSerendipity/.github/governance`，本仓不复制规则正文。

## 6. 变更影响面

| 改什么 | 必须同步 | 由谁校验 |
|---|---|---|
| 目录结构 / 入口 | 本文「组件与依赖方向」与「数据流」 | 维护者 |
| CI 与门禁 | 本仓 `README.md` 的测试命令；治理仓 §20 远端载体口径 | `audit-drift.py` |
| 依赖清单 | 锁文件与 `.github/dependabot.yml` 的生态段 | Dependabot / `lock-consistency` |
| README 展示图 | §8.1 真实性红线（图必须来自真实运行） | 治理仓 `readme-image-provenance` |
