# 写入策略 · 第一步（提取：把一段原文抽成候选事实）

对应学习笔记：[docs/学习模块/10-Memory/02-写入策略.md](../../docs/学习模块/10-Memory/02-写入策略.md)

## 现在怎么跑

```bash
cd apps
yarn app:10-02-write-policy-step-1
```

浏览器打开：http://127.0.0.1:50104/

端口：`50104`（yarn 脚本 inline `PORT=50104`；`lib/http/runtime-ctx.ts` `.default(50104)` 兜底）

## 数据流

```text
用户在页面写一段对话原文（或点例句按钮）
    → 点「提取候选事实」POST /api/extract
    → 服务端拼 messages：
        system = 提取规则（六个字段的形状 + 0~N 条不报错）+ 今天的日期（todayBjt）
        user   = 这段对话原文
    → 调协议 A 对话补全（response_format: json_object）
    → 解析模型返回的 JSON，Zod 校验 candidates 数组（允许长度为 0）
    → 页面：
        ① 候选事实清单卡片：每条含 key / value / type / confidence / source / validUntil
        ② 完整的模型请求（原始 request）
        ③ 完整的模型响应（原始 response）
        ④ 历史提取记录列表（可以连续提取多段原文，对照各自抽出几条）
```

## 当前能做什么

- 输入任意一段对话原文，或点三个例句按钮（分别期望：0 条候选 / 语义+情景各出 / validUntil 换算出具体日期）
- 看见真实发给模型的请求体和模型返回的原始响应，不是摘要
- 空原文 → 4xx；「演示后端 5xx」→ 另一条失败通道
- 本步只做写入策略八关里的「提取」这一关，不做把关 / 去重 / 冲突 / 过期 / 落库——那些是下一步要加的能力
