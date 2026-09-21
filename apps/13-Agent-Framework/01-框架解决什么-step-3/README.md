# 框架解决什么 · step-3

对应小节：[docs/学习模块/13-Agent-Framework/01-框架解决什么.md](../../../docs/学习模块/13-Agent-Framework/01-框架解决什么.md)

**端口**：`50141`（浏览器 [http://127.0.0.1:50141/](http://127.0.0.1:50141/)）

**怎么跑**：`cd apps && yarn app:13-01-framework-solves-what-step-3`

## 现在能做什么

- 首页 `/`：嵌入模型向量化子页，三 mode 同源对照：
  - **模式 A · embed 单条**：文本 → `number[]` + 维度 + token 用量
  - **模式 B · embedMany 批量**：字符串数组 → `number[][]` + 聚合 token
  - **模式 C · 余弦检索**：embed + embedMany 并发 + 余弦相似度排序取 Top-K（点咖啡小程序场景）

## 模式说明

| 模式 | 接口 | 函数 | 用途 |
| --- | --- | --- | --- |
| A | POST `/api/embed` | `ai.embed({ model, value })` | 把一段文字变一条向量 |
| B | POST `/api/embed-many` | `ai.embedMany({ model, values })` | 把多段文字变多条向量（按 provider 限制自动拆批并发） |
| C | POST `/api/cosine-recall` | `Promise.all([embed, embedMany])` + 余弦相似度排序 | RAG 的「检索阶段」最小可用形式 |

## 数据流

```text
浏览器 → /api/embed 或 /api/embed-many 或 /api/cosine-recall
   ↓
lib/flow/embed.ts（单条）/ embed-many.ts（批量）/ cosine-recall.ts（并发 + 排序）
   ↓
lib/cafe/embed.ts → createOpenAI().textEmbeddingModel(embeddingModel)
   ↓
provider 的 /v1/embeddings 端点
   ↓
number[] / number[][] + usage.tokens → JSON 写回浏览器
```

## 依赖

- `ai`（Vercel AI SDK）
- `@ai-sdk/openai`（拼 embedding 模型，复用同 baseURL）
- 不引 `openai-compatible` / `anthropic` —— 嵌入接口只有 OpenAI 协议那一条

## 对照点

- 模块 08 RAG 第 3 条（余弦相似度）已写过公式；本 step 只把它包进来当检索阶段的最小可用形式
- 模式 C 的 `query = "来一杯中杯热拿铁"`，documents 默认是点咖啡小程序候选文档库
- 期望 Top-1：「今日菜单：中杯热拿铁 ¥28；大杯冰美式 ¥22」——「语义近」在几何上的体现
