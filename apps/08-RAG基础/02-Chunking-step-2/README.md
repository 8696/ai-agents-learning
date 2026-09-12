# 切块（Chunking） · 第二步 · 单位 + 兜底 + size×Top-K 撞预算

字符 / 词元 / 汉字三种数法对照 + 超长块自动按字数切兜底 + size×Top-K 撞预算提示——纯本地文本操作。

## 跑入口

```bash
cd apps && yarn app:08-02-chunking-step-2
# 浏览器：http://127.0.0.1:50073/
```

## 端口

`50073`（已与 `apps/package.json` 的 `PORT=50073` inline + `lib/http/runtime-ctx.ts` 的 `.default(50073)` + `public/components/layout.js` 的页脚 fallback + `apps/README.md` 占用表 四处一致）。

## 数据流

```
浏览器 (React + Babel Standalone)
   ├─ GET /health                  → { ok, port, provider, model, hasKey, callsModel:false }
   ├─ POST /api/chunk/fixed        body={text,size,overlap} → chunkByFixed (lib/flow/chunk.ts)
   ├─ POST /api/chunk/structure    body={text}              → chunkByStructure
   ├─ POST /api/chunk/faq          body={text}              → chunkByFaq
   └─ GET  /api/demo-error         → 故意 500（第二类错误）
```

`server.ts` 只做装配：bodyParser → 挂 routes → serve public → listen；业务在 `routes/*.ts`；本步核心（chunk 函数）在 `lib/flow/chunk.ts` 单独成文件，文件头写「本步核心」。

## 当前能做什么

- **左栏 · 固定长度切**：size / overlap 滑块驱动；改 → 块数 / 每块字数 / 半句话开头块数立刻可见；切口处高亮与上一块重叠的部分。
- **中栏 · 按结构切**：按 Markdown `##` → 段落 → 句号递归切；每块带「在哪个边界」徽标（## / 段落 / 句号）。
- **右栏 · FAQ 切**：固定用 FAQ 样例文档，演示「每块自洽 → overlap = 0 也合理」。
- **第一类错误（4xx）**：点「演示空输入（4xx · 第一类错误）」→ 服务端 Zod 校验失败，HTTP 400 + 红字。
- **第二类错误（5xx）**：点「演示后端 5xx（第二类错误 · /api/demo-error）」→ HTTP 500 + 红字。两类红字分开可见。

## 教学点对照

覆盖需求清单 1~6 + 7、8：

| 需求 | 在哪 |
| ---- | ---- |
| 1 · 同份文档两种切法并排能看见 | 左 + 中两栏 + 三栏独立请求 |
| 2 · size 可调，太大太小的后果当场可见 | 左栏滑块 + 半句话开头块数红字 |
| 3 · 大小的单位 + 兜底截断（step-2 再深做） | 本步显示「字符数」+「≈ N token」估算；兜底截断推到 step-2 |
| 4 · overlap 可调，且能看见它救了哪一块 | 左栏滑块 + 每块卡片高亮「与上一块重叠 N 字」 |
| 5 · overlap 的代价能量化（step-2 量化） | 本步看「重叠 N 字」徽标；step-2 量化库膨胀 + 嵌入次数 |
| 6 · 重叠命中重复内容能看出来（step-2） | 本步看每块重叠部分；step-2 量化 |
| 7 · 重叠 = 0 合理的场景能演示 | 右栏 FAQ 切 |
| 8 · 递归切分：结构优先、超长降级 | 中栏按 ## / 段落 / 句号三档降级（已实现简化版；完整递归 step-2） |

## 对应学习沉淀

- `docs/学习模块/08-RAG基础/02-Chunking.md` · 「切块三件事：size / overlap / 切法」的对照演示
- 本步对应「是什么 / 大小 / 重叠 / 切法」四节，覆盖需求清单 1~8 中的 1 / 2 / 4 / 7 / 8
- step-2 入口做需求 3（单位+兜底）+ 5/6（量化 overlap 代价）+ 9~15（递归完整 / 标题继承 / PDF / 不能腰斩 / 父子切块）

## 文件清单

```
apps/08-RAG基础/02-Chunking-step-1/
├── server.ts                          ← 装配（≤120 行）
├── README.md
├── lib/
│   ├── http/runtime-ctx.ts            ← PORT 50072
│   ├── logger.ts                      ← 本地 freeze 副本（拷自顶层 apps/logger.ts）
│   └── flow/chunk.ts                  ← 本步核心：chunkByFixed / chunkByStructure / chunkByFaq
├── routes/
│   ├── health.ts                      ← GET /health
│   ├── chunk-fixed.ts                 ← POST /api/chunk/fixed
│   ├── chunk-structure.ts             ← POST /api/chunk/structure
│   ├── chunk-faq.ts                   ← POST /api/chunk/faq
│   └── demo-error.ts                  ← GET /api/demo-error（5xx 第二类错误）
└── public/
    ├── index.html                     ← 同页三栏对照
    └── components/
        ├── layout.js                  ← StatusPill / PageIntro / EnvFooter
        └── chunk-panels.js            ← Panel / StatsBar / ChunkCard
```