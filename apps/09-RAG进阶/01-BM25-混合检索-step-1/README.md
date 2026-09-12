# 09-RAG进阶 · 01-BM25-混合检索 · step-1

## 跑入口

```bash
cd apps && yarn app:09-01-bm25-hybrid-step-1
```

浏览器：`http://127.0.0.1:50087/`

## 端口

`50087`（apps/README.md 占用表、package.json yarn 脚本、`runtime-ctx.ts` `.default()`、本 README 四处一致；本步不复制到别处）。

## 数据流

```text
浏览器输入问句
   ├─ 点「跑向量检索」→ POST /api/search-vector
   │     └─ routes/search-vector → lib/flow/bm25-vs-vector.searchByVector
   │         ├─ 首次：嵌入 CORPUS（type=db）→ 模块级缓存
   │         ├─ 每次：嵌入 query（type=query）→ 真发网络请求
   │         ├─ 余弦相似度 → 排序 → Top-K
   │         └─ 返回 { query, topK, embeddingModel, rows[] }
   └─ 点「跑 BM25」→ POST /api/search-bm25
         └─ routes/search-bm25 → lib/flow/bm25-vs-vector.searchByBm25
             ├─ tokenize（保留连字符 / 点号 / 单字切中文）
             ├─ BM25 打分（k1=1.5, b=0.75）→ 排序 → Top-K
             └─ 返回 { query, topK, tokens, rows[] }
```

## 当前能做什么

- **同一库 6 条售后卡**：编号卡 2 张（SKU-8821 / SKU-8822）+ 通用政策 3 张（路由器保修 / 运输破损 / 发票）+ 错误码 1 张（ERR-4401）。
- **两个对照实验**：带货号的问句「SKU-8821 保修几年？」 + 日常说法、库里未必同词的问句「杯子裂了怎么退？」，每个实验可改问句。
- **每个实验 4 次独立请求**：向量侧一次 + BM25 侧一次（共 4 次/会话完整跑）。
- **并排卡片**：左侧「向量侧 · 余弦相似度」+ 右侧「BM25 侧 · 关键词打分」，每张卡显示 Top-K 排名 + 分数 + 命中词 + 「该中的卡 ✓」徽标。
- **失败可读**：4xx（空输入 / JSON 错）+ 5xx（嵌入接口失败）—— 状态栏 + 卡片状态栏标 ❌ + 服务端 logs/ 当当日文件里完整错误对象。
- **环境元信息**：页脚 `#env-info` 来自 `GET /health`，显示端口 / 模型服务商 / 模型 / 嵌入模型 / 密钥 / 是否会调模型。

## 对应学习沉淀

- 概念：[docs/学习模块/09-RAG进阶/01-BM25-混合检索.md](../../docs/学习模块/09-RAG进阶/01-BM25-混合检索.md)
- 进度表：模块 09 README「小节进度」第 1 条；本步覆盖需求 1、2、3（变体 1、2、3）。

## 局限（step-1 边界）

- **只演示变体 1、2、3**：向量漏编号 / BM25 中编号 / 日常说法、库里未必同词的问句 BM25 漏。
- **变体 4-8（混合两边召回、融合、RRF、按问句偏置、切词）** → step-2+。
- **CORPUS 写死**：不导入用户文件；导入走模块 08 第 1 条 RAG 流水线。
- **嵌入调用每次都重新发**：CORPUS 预嵌入一次缓存到模块顶层；query 每次都嵌（教学上「一次一个」更直观）。