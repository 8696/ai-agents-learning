# Skills vs MCP · 第一步

对应学习笔记：[docs/学习模块/12-MCP/03-Skills-vs-MCP.md](../../../docs/学习模块/12-MCP/03-Skills-vs-MCP.md)

## 现在怎么跑

```bash
cd apps
yarn app:12-03-skills-vs-mcp-step-1
```

浏览器打开 <http://127.0.0.1:50136/>

端口：`50136`（yarn 脚本 inline；`runtime-ctx` 兜底同一数字）。

## 数据流

```text
客人那句话
   │
   ├─ POST /api/assembly/mcp-only            → 只接吧台 → 直接 make_latte
   ├─ POST /api/assembly/skill-only          → 只读技能 → 没有工具，空口说做好了
   ├─ POST /api/assembly/both                → 吧台 + 技能 → 先读过敏原，改推美式
   ├─ POST /api/assembly/system-prompt-full  → system prompt 塞四册全文（出杯/过敏/周报/菜单）→ 业务行为同 both；周报也在
   └─ POST /api/assembly/on-demand           → system prompt 只带 AGENTS.md + 技能目录；按 utterance 命中加载
```

主路径在 `lib/flow/run-assembly.ts`。五条 URL 分五个 route 文件，页面上五个按钮各打各的。本步不调大模型（固定剧本）。

页面（顶部 `<PageNav>` 跨页导航，三页同 step-1 / 同端口 50136 / 同 `lib/flow/` 核心）：

- `/` 三装配对照（需求 1/2/3）
- `/pages/system-prompt-full.html` 系统提示词塞满（需求 4 一侧）
- `/pages/on-demand.html` 按需加载技能（需求 4 另一侧 + 需求 8）

## 当前能做什么

- 同一句「我牛奶过敏，来一杯拿铁」看五种装配的可观察差异
- 切 utterance 到「今天有摩卡吗」「本周销量周报怎么写」：对照 system prompt 体积、本次加载的技能列表、周报全文是否在 prompt
- 空点单走 4xx；「演示后端 5xx」走另一条失败通道
- 页脚 `#env-info` 来自 `GET /health`（`callsModel: false`）
