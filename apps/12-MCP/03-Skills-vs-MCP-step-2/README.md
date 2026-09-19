# Skills vs MCP · 第二步

对应学习笔记：[docs/学习模块/12-MCP/03-Skills-vs-MCP.md](../../../docs/学习模块/12-MCP/03-Skills-vs-MCP.md)
对应前置 demo：`yarn app:12-03-skills-vs-mcp-step-1`（端口 50136，三装配 + system prompt 装载见 step-1）

## 现在怎么跑

```bash
cd apps
yarn app:12-03-skills-vs-mcp-step-2
```

浏览器打开 <http://127.0.0.1:50137/>

端口：`50137`（yarn 脚本 inline；`runtime-ctx` 兜底同一数字）。

## 数据流

```text
客人那句话（仅 prompt-source 用）
   │
   ├─ POST /api/classify/:scenarioId            → 分类题（apply_latte_policy 应判进哪 / 技能里塞 HTTP+Token 应判进哪）
   ├─ POST /api/prompt-source/mcp-prompt        → MCP 提示词模板（顾客点开场白）
   ├─ POST /api/prompt-source/skill             → 技能（出杯流程）
   └─ POST /api/prompt-source/system-prompt     → 系统提示词（角色设定）
```

主路径分两块：`lib/flow/classify.ts`（分类题判定 + 解释）+ `lib/flow/prompt-source.ts`（三种入口各自组装 messages + 返回轨迹）。sub-page 一个一个 POST，互不打包装运。本步不调大模型（固定剧本）。

页面（顶部 `<PageNav>` 跨页导航，两页同 step-2 / 同端口 50137）：

- `/pages/classify.html` 分类题（需求 5 / 6）
- `/pages/prompt-source.html` 三种提示词入口（需求 7）

## 当前能做什么

- 分类题：两个场景（apply_latte_policy / 技能里塞 HTTP+Token）每题四个选项 + 选完看判定 + 解释
- 三种提示词入口：MCP 提示词模板 / 技能 / 系统提示词三按钮各打各的 URL，三栏对照「谁决定用 / 住在哪 / 在点咖啡里是什么」
- 空点单走 4xx；「演示后端 5xx」走另一条失败通道
- 页脚 `#env-info` 来自 `GET /health`（`callsModel: false`）
