# 记忆分类 · 第三步（按相关性召回 + 拼进 Prompt + 调大模型）

对应学习笔记：[docs/学习模块/10-Memory/01-记忆分类.md](../../docs/学习模块/10-Memory/01-记忆分类.md)

## 现在怎么跑

```bash
cd apps
yarn app:10-01-memory-types-step-3
```

浏览器打开：http://127.0.0.1:50102/

端口：`50102`（yarn 脚本 inline `PORT=50102`；`lib/http/runtime-ctx.ts` `.default(50102)` 兜底）

## 数据流

```text
用户在页面输入一句「问句」（或点四个例句）
    → 点「只检索看 Prompt」POST /api/retrieve { query }
    → 服务端：
        ① 把问句切成 token（英文按词、中文按字，统一小写）
        ② 读 data/facts.json 取候选池
        ③ 对每条事实算 Jaccard 相似度 = |A ∩ B| / |A ∪ B|
        ④ 按分数倒序、取 Top-K=3
        ⑤ 把 Top-K 拼进 system 段（提示词告诉模型只能基于筛出的事实回答）+ user 段放问句
    → 返回：候选池 + Top-K（每条的分数 + 命中 token）+ 拼好的 Prompt（messages）
    → 页面同时展示三栏对照：① 候选池 ② Top-K（按分数倒序，带命中关键词） ③ 拼好的完整 Prompt

点「检索并问」POST /api/ask { query }
    → 走完上面 ①~⑤，再调一次协议 A 对话补全
    → 页面再补三件：模型回答 + 完整 modelRequest + 完整 modelResponse
```

## 当前能做什么

- 输入任意一句问句，或点四个例句对照四种召回结果
- 看见候选池有多大、Top-K=3 是按什么分数筛的、命中了哪些 token
- 看见拼进 Prompt 的 system 段长什么样（system 里已经把 Top-K 摆好 + 告诉模型只能引用这些事实）
- 点「检索并问」再调一次大模型，看模型回答里有没有真的只引用 Top-K 的事实
- 空问句 → 4xx；缺 密钥 → 503（NO_KEY）；「演示后端 5xx」→ 另一条失败通道
- 本步只读不写事实库——事实库由 `yarn app:10-01-memory-types-step-2`（端口 50101）写入

## 与 step-1 / step-2 的关系

- step-1（端口 50100）：分类本身，不持久化
- step-2（端口 50101）：分类 + 写入到 data/facts.json + 重启验证
- step-3（本步）：从 step-2 写入的事实库里按相关性召回 + 拼 Prompt + 调大模型
- 三个 demo 互不依赖，可单独跑；step-3 假设事实库已有内容（建议先跑 step-2 落几条再回 step-3）