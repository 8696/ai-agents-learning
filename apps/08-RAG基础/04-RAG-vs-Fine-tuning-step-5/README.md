# 模块 08 · 04 · RAG vs Fine-tuning · 第五步（step-5）

## 跑入口

```bash
cd apps
yarn app:08-04-rag-vs-fine-tuning-step-5
```

端口：**50084**（主源 = `apps/package.json` 脚本里 inline 的 `PORT=50084`）。
浏览器：`http://127.0.0.1:50084/`

## 跑什么

本 step 是「决策卡 + 反例集」—— 6 个 sub-page 共享同一端口 50084（按 §5.3.14 例外「当前 step 加页面 + 导航承接」），每个 sub-page 承担一个变体的反例 / 对照卡。

注：原本 8 个 sub-page（含 A5 混合 / A6 不该检索），已在 step-7 / step-6 独立 sub-page 落地 —— 本 step 仅剩 6 个决策卡 sub-page。

| sub-page | 变体 | 性质 |
| -- | -- | -- |
| [/pages/style-vs-structured.html](/pages/style-vs-structured.html) | 需求 3 · 风格稳 | 决策卡 · 走结构化输出 |
| [/pages/privacy-irreversible.html](/pages/privacy-irreversible.html) | 需求 11 · 隐私 | 决策卡 · 反例演示 |
| [/pages/capability-boundary.html](/pages/capability-boundary.html) | 需求 12 · 能力边界 | 决策卡 · 反例演示 |
| [/pages/fewshot-vs-finetune.html](/pages/fewshot-vs-finetune.html) | 需求 13 · 检索 ≠ 微调 | 决策卡 · 反例演示 |
| [/pages/cost-card.html](/pages/cost-card.html) | 变体 9 · 成本对照 | 决策卡 · 对照卡 |
| [/pages/human-in-the-loop.html](/pages/human-in-the-loop.html) | 需求 14 · 人在回路 | 决策卡 · 边界 |

## 数据流```text
浏览器加载 http://127.0.0.1:50084/
  → public/index.html 总览（6 个 sub-page 入口 + PageNav）
  → 跳到任一决策卡 sub-page（共享 50084 端口）

/pages/style-vs-structured.html
  └─ 纯展示决策卡：6 行对照表（JSON 字段稳 / 日期格式 / 枚举 / 口吻 / 术语 / 领域反应深度）
  └─ 无 API 调用

/pages/privacy-irreversible.html
  └─ 纯展示决策卡：5 行禁入训练集 + 3 行删文档 vs 撤回权重
  └─ 无 API 调用

（其他 4 个 sub-page 同上：纯展示决策卡 + PageNav 跳转）

/api/demo-error（§5.3.2 #2 第二类错误通道）
  └─ GET /api/demo-error → 500 + 错误信息 → 任何 sub-page 的「演示上游失败」按钮触发
```

## 当前能做什么

**6 个决策卡 sub-page**：对照表 + 反例清单 + 一句话原则；不进代码，纯展示。

| sub-page | 核心反例 / 决策点 |
| -- | -- |
| 风格稳 | JSON 字段稳 → 走结构化输出（Zod + strict schema），别为了字段名去微调 |
| 隐私 | 内部薪资表 / 密钥 / 未公开合同 禁入训练集；删文档做得到、撤权重做不到 |
| 能力边界 | 流程题靠 RAG 救不回来；事实 / 政策问题 → RAG，行为 / 流程问题 → 微调 或 工作流 |
| 检索 ≠ 微调 | 检索 3 条好评当少样本 ≠ 已微调（权重没动）|
| 成本对照 | 知识还在改 → RAG 便宜；政策稳定 1 年 → 微调可能划算 |
| 人在回路 | 转账 / 删库 / 改生产配置 → 必须人确认；RAG / 微调只给建议 |

## 本步核心

- 6 个决策卡 sub-page 全部纯展示 —— **不调 LLM**
- 端点：
  - `routes/health.ts`：GET /health → 页脚 provider / model / hasKey
  - `routes/corpus-edit.ts`：POST /api/corpus-edit → 改 refund-v2-001（保留 —— 为 sub-page 演示 "演示上游失败" 按钮预留接口契约；当前 sub-page 不调）
  - `routes/demo-error.ts`：GET /api/demo-error → §5.3.2 #2 第二类错误
- 共享组件：
  - `public/components/layout.js`：EnvFooter
  - `public/components/page-nav.js`：6 个 sub-page tab 跳转

## 对应学习沉淀

[docs/学习模块/08-RAG基础/04-RAG-vs-Fine-tuning.md](../../docs/学习模块/08-RAG基础/04-RAG-vs-Fine-tuning.md)

本 step 对应 MD 决策卡节（需求 3 / 11 / 12 / 13 / 变体 9 / 14）。step-1~4 已固化需求 1 + 2 + 4 + 7 + 8 + 10；step-6 固化需求 6；step-7 固化需求 5。

## 与 step-1 的差异（增量构建）

step-5 = **独立新文件夹**（不复用 step-1~4 代码）：
- 6 个决策卡 sub-page 纯展示，无 `lib/flow/answer-*.ts`（**已删** lib/flow/answer-no-retrieve.ts 孤儿文件）
- 路由层**已删**孤儿路由：mountRagMixRoute + mountNoRetrieveRoute（对应 pages/mix.html + no-retrieve-chat.html 已分别拆到 step-7 / step-6）
- 共享同一端口 50084（§5.3.14 例外「当前 step 加页面 + 导航承接」）

## 锁定时机

按 [AGENTS.md §5.3.14](https://…/agents/05-demo.md#5314-demo-子节拆分动态引导由浅入深新)：step-N 是工作区，自由打磨；学习者主动说「锁定」那一刻才校验 §5.3.2 6 项 + `node scripts/check-demo.cjs` 过 + `cd apps && yarn typecheck` 过。**未锁定前可改可重构**。