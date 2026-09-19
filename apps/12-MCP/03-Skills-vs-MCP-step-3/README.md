# Skills vs MCP · 第三步

对应学习笔记：[docs/学习模块/12-MCP/03-Skills-vs-MCP.md](../../../docs/学习模块/12-MCP/03-Skills-vs-MCP.md)
对应前置 demo：`yarn app:12-03-skills-vs-mcp-step-1`（端口 50136，三装配 + system prompt 装载）/ `yarn app:12-03-skills-vs-mcp-step-2`（端口 50137，分类题 + 三种提示词入口）

## 现在怎么跑

```bash
cd apps
yarn app:12-03-skills-vs-mcp-step-3
```

浏览器打开 <http://127.0.0.1:50138/>

端口：`50138`（yarn 脚本 inline；`runtime-ctx` 兜底同一数字）。

## 数据流

```text
客人那句话
   │
   ├─ POST /api/skills/mode-full          → full：短目录常驻 + 10 个技能全文全加载
   ├─ POST /api/skills/mode-catalog       → catalog-only：短目录常驻 + 全文都不加载
   └─ POST /api/skills/mode-on-demand     → on-demand：短目录常驻 + 命中技能加载全文
```

主路径在 `lib/flow/skill-catalog.ts`：`loadSkillsForMode(mode, utterance)` 一次返回 `{ shortCatalog, fullSkillsLoaded, matchedSkills, systemPromptChars, matchedTriggerMap }`。三条 URL 分三个 route 文件，页面上三个按钮各打各的。本步不调大模型（固定剧本）。

## 当前能做什么

- 同一句 utterance 看三种装配下 system prompt 体积与加载技能列表的可观察差异
- 切 utterance 到「今天有摩卡吗」「本周销量周报怎么写」「我要投诉」：对照 matchedSkills / fullSkillsLoaded / matchedTriggerMap
- 页脚 `#env-info` 来自 `GET /health`（`callsModel: false`）