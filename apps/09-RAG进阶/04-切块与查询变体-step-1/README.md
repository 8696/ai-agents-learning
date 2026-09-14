# 切块与查询变体 · 第一步（父子切块）

对应学习笔记：[docs/学习模块/09-RAG进阶/04-切块与查询变体.md](../../docs/学习模块/09-RAG进阶/04-切块与查询变体.md)

## 现在怎么跑

```bash
cd apps
yarn app:09-04-chunk-query-variants-step-1
```

浏览器打开：http://127.0.0.1:50098/

端口：`50098`（yarn 脚本 inline `PORT=50098`；`lib/http/runtime-ctx.ts` `.default(50098)` 兜底）

## 数据流

**建库（应用启动时一次性）**

```text
6 个子块的「标题 + 正文」
    ↓ 调嵌入接口（OpenAI Embeddings；按 provider 分支：MiniMax 走 texts+type，其他走 input+encoding_format=float）
    ↓ 每个文本变成一组浮点数（向量，如 1536 维）
存到内存 Map<childId, vector>（本步的「向量库」）

注意：父块（PARENTS，3 条）**不进向量库**——父子切块的根就是不让父块进库，
避免父块讲多个主题被平均掉检索信号。
```

**检索（每次点「检索并生成」）**

```text
页面加载 GET /api/index-status
    → 顶部「向量库状态」卡：已建库 N 条、维度、建库耗时

用户点「检索并生成」POST /api/parent-child
    → 用户问句 → 嵌入接口（只算这 1 个向量）
    → 在已建好的向量库上跑余弦相似度（cos = A·B / |A|·|B|），按分数降序排
    → 取前 K 条（默认 3）标「入选 topK」，按 parentId 取父块，同一父亲去重
    → 父块全文塞进提示词，协议 A 调一次对话补全

页面输出：
    ① 检索这一步 · 问句转向量（queryEmbed 摘要 + 前 8 维预览）
    ② 全部 6 个子块的余弦相似度 + 排名（Child Coverage）
    ③ 命中的子块（topK 内）
    ④ 去重后的父块
    ⑤ 模型实际收到的 messages
    ⑥ 模型实际返回的 completion
    ⑦ 最终答复
```

## 当前能做什么

- 看见检索单位（子块）和生成单位（父块）不是同一段文字
- 默认问句会打中同一父块下的多个子块，右栏父块只出现一次
- 空问句 → 4xx；「演示后端 5xx」→ 另一条失败通道
- 本步不演示情境检索、多路查询、查询扩展
