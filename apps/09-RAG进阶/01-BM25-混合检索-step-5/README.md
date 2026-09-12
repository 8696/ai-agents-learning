# 09-RAG进阶 · 01-BM25-混合检索 · step-5

## 跑入口

```bash
cd apps && yarn app:09-01-bm25-hybrid-step-5
```

浏览器：`http://127.0.0.1:50091/`

## 端口

`50091`（apps/README.md 占用表、package.json yarn 脚本、`runtime-ctx.ts` `.default()`、本 README 四处一致）。

## 数据流

```text
浏览器
  ├─ 内置判定列表 → GET /api/judge-cases
  ├─ 跑一条 / 跑全部 → POST /api/judge-run
  │     └─ lib/flow/handwritten-vs-wink
  │           ├─ 手写 bm25Score（lib/corpus/bm25.ts）
  │           └─ wink searchByWink（lib/corpus/wink-bm25.ts · wink-bm25-text-search）
  └─ 自定义问句对照 → POST /api/compare-bm25（同上两侧，不跑规则）
```

## 当前能做什么

- **手写 vs 成熟库**：同一 CORPUS（云 API 售后 6 卡）、同一套 keep-dash 切词，两侧并排 Top-K。
- **内置判定列表**：生产密钥 ID / ERR-9020 / 公司发票 / 近邻测试密钥 / 无共同词英文问 —— 自动判过 / 不过。
- **分数可以不同，比的是 Top-1 结论**（IDF 细节两边不完全一样）。
- 纯本地，不调大模型（`callsModel: false`）。

## 对应学习沉淀

- 概念：[docs/学习模块/09-RAG进阶/01-BM25-混合检索.md](../../../docs/学习模块/09-RAG进阶/01-BM25-混合检索.md)
- 本步对应取舍：「教学自己写公式」vs「生产接成熟库」。

## 局限

- 未接 Elasticsearch；演示的是进程内成熟库，不是搜索集群。
- 中文仍按单字切（与前几步一致），不是 jieba。
