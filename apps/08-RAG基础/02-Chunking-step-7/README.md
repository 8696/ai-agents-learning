# 切块（Chunking） · 第七步 · atomic 块保护

演示「有些结构不能切」——表格 / 代码围栏 / 编号条款，atomic 整块保留；超嵌入上限时给兜底说明而不是静默截断。纯本地文本操作，不调 LLM。

## 跑入口

```bash
cd apps && yarn app:08-02-chunking-step-7
# 浏览器：http://127.0.0.1:50078/
```

## 端口

`50078`（已与 `apps/package.json` 的 `PORT=50078` inline + `lib/http/runtime-ctx.ts` 的 `.default(50078)` + `public/components/layout.js` 的页脚 fallback + `apps/README.md` 占用表 四处一致）。

## 数据流

```
浏览器 (React + Babel Standalone)
   ├─ GET /health                       → { ok, port, provider, model, hasKey, callsModel:false }
   ├─ POST /api/chunk/structure         body={text}                       → chunkByStructure (lib/flow/chunk.ts) — 档 1「关闭 atomic」
   ├─ POST /api/chunk/atomic            body={text, threshold=2000}       → chunkByAtomic   (lib/flow/chunk-atomic.ts) — 档 2「开启 atomic」
   ├─ POST /api/chunk/atomic-overflow   body={text, threshold=200}        → chunkByAtomic   (lib/flow/chunk-atomic.ts) — 档 3「开启 atomic + 超阈值」
   ├─ POST /api/chunk/fixed             body={text,size,overlap}          → chunkByFixed    (对照：永远把 atomic 也按 size 切开)
   ├─ POST /api/chunk/faq               body={text}                       → chunkByFaq      (对照：FAQ 文档如何切)
   └─ GET  /api/demo-error              → 故意 500（第二类错误）
```

`server.ts` 只做装配：bodyParser → 挂 routes → serve public → listen；业务在 `routes/*.ts`；本步核心（atomic 识别 + 保护版结构切）在 `lib/flow/chunk-atomic.ts` 单独成文件，文件头写「本步核心」；`lib/flow/chunk.ts` 保留 chunkByFixed / chunkByStructure / chunkByFaq 作为对照与复用。

## 当前能做什么

- **档 1 · 关闭 atomic**：点「跑关闭 atomic」→ 调 `/api/chunk/structure` → 表格可能被切两半（表头 / 数据行分家）、编号条款散开到其他块——直接演示「没保护时的痛点」。
- **档 2 · 开启 atomic（生产阈值）**：点「跑开启 atomic」→ 调 `/api/chunk/atomic`，threshold=2000 → 表格 / 代码围栏 / 编号条款整块保留（紫色「整块保留」徽标），其余按结构切。
- **档 3 · 开启 atomic + 超阈值**：点「跑超阈值演示」→ 调 `/api/chunk/atomic-overflow`，threshold=200（故意小）→ atomic 块超阈值时标 fallbackSplit=true + red「超嵌入上限」徽标 + 红字 overflowNote 说明「宁可超过 size 上限也不切开，超过嵌入上限时再单独处理」。
- **第一类错误（4xx）**：Zod 校验失败时返回 400（任何端点都拦）。
- **第二类错误（5xx）**：点「演示上游失败」会走 `/api/demo-error` 返回 500。

## 教学点对照

覆盖需求清单 10 + 变体 14 + 踩坑 6：

| 需求 / 变体 / 踩坑 | 在哪 |
| ------------------ | ---- |
| 需求 10 · 表格不被切在中间 | 档 2 atomic-table 整块保留 |
| 需求 10 · 编号条款和内容不分家 | 档 2 atomic-numbered-clause 整块保留 |
| 需求 10 · 超嵌入上限给出处理说明而非静默切断 | 档 3 overflowNote 红字说明 |
| 变体 14 · 「不能腰斩的结构」（表格 / 代码块 / 编号条款） | 三档对照演示 |
| 踩坑 6 · 把表格 / 代码块 / 编号条款切断 | 档 1 反例：表格被切两半 |

## 对应学习沉淀

- `docs/学习模块/08-RAG基础/02-Chunking.md` · 「变体 14 / 需求 10 / 踩坑 6」的对照演示
- 本步对应「变体 14 整章 + 需求 10 + 踩坑 6」

## 文件清单

```
apps/08-RAG基础/02-Chunking-step-7/
├── server.ts                          ← 装配（≤120 行）
├── README.md
├── lib/
│   ├── http/runtime-ctx.ts            ← PORT 50078
│   ├── logger.ts                      ← 本地 freeze 副本（拷自顶层 apps/logger.ts）
│   └── flow/
│       ├── chunk.ts                   ← 保留 chunkByFixed / chunkByStructure / chunkByFaq（对照 + 复用）
│       ├── chunk-atomic.ts            ← 本步核心：extractAtomicBlocks + chunkByAtomic
│       └── chunk-splitters.ts         ← splitByMarkdownH2 / splitByBlankLine / splitByPeriod
├── routes/
│   ├── health.ts                      ← GET /health
│   ├── chunk-fixed.ts                 ← POST /api/chunk/fixed（对照）
│   ├── chunk-structure.ts             ← POST /api/chunk/structure（档 1）
│   ├── chunk-atomic.ts                ← POST /api/chunk/atomic（档 2）
│   ├── chunk-atomic-overflow.ts       ← POST /api/chunk/atomic-overflow（档 3）
│   ├── chunk-faq.ts                   ← POST /api/chunk/faq（对照）
│   └── demo-error.ts                  ← GET /api/demo-error（5xx 第二类错误）
└── public/
    ├── index.html                     ← 三档 atomic 对照页面
    └── components/
        ├── layout.js                  ← StatusPill / PageIntro / EnvFooter
        ├── chunk-panels.js            ← ChunkCard / StatsBar / Panel
        └── atomic-panels.js           ← AtomicComparePanel / AtomicColumn（三档对照）
```