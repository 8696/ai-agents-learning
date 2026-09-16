# 写入策略 · 第十二步（压缩与摘要 · 第 7 关完整版）

对应学习笔记：[docs/学习模块/10-Memory/02-写入策略.md](../../docs/学习模块/10-Memory/02-写入策略.md)

## 现在怎么跑

```bash
cd apps
yarn app:10-02-write-policy-step-12
```

浏览器打开：http://127.0.0.1:50115/

端口：`50115`（yarn 脚本 inline `PORT=50115`；`lib/http/runtime-ctx.ts` `.default(50115)` 兜底）

## 数据流

```text
用户访问总览 / 整段摘要 / 多条画像 / 自动合并 / 调取预览（PageNav 跳转）
  → 总览：笔记 §6 三个层次 + §7 容量上限设计原则 + 本步覆盖四个 sub-page
  → 整段摘要 sub-page:
      灌入示例（POST /api/seed）→ 库里写 5 条零碎事 + 1 段 12 轮对话原文
      压缩对话原文（POST /api/compress-session）→ compressSession 调大模型
        → 模型返 { summary, modelRequest, modelResponse }
        → 路由把 summary 写进 chat_session_v1 事实的 summary 字段
        → 返完整 modelRequest + modelResponse + 库状态
  → 多条画像 sub-page:
      灌入示例（POST /api/seed）→ 同上
      合并画像（POST /api/compress-image）→ mergeFactsToImage 调大模型
        → 模型返 { image, modelRequest, modelResponse }
        → 路由把 image 写进 user_profile_v1 事实的 summary 字段
        → 返完整 modelRequest + modelResponse + 库状态
  → 自动合并 sub-page:
      灌入示例（POST /api/seed）→ 同上
      设容量阈值（POST /api/capacity/config）→ 落 KV key = _capacity_threshold_chars
      写入新事实（POST /api/auto-merge/write）→ writeAndCheck
        → kvSet 新事实
        → checkCapacity：库总字符 ≥ 阈值？
          → 没超：返 state，不合并
          → 超了：调 mergeFactsToImage(所有未归档零碎事 keys)
                → 写 user_profile_auto.summary
                → 把被合并的零碎事标 archived_at
                → 返完整 modelRequest + modelResponse + 合并结果
  → 调取预览 sub-page（变体 7-E）：
      灌入示例（POST /api/seed）→ 同上
      调取预览（POST /api/recall-preview）→ recallPreview
        → kvListForDisplay 读 user_profile_auto + chat_session_v1
        → 拼成 system + user：素材分三层标注（综合层画像 / 对话原文 / 对话摘要）
        → 调大模型生成「基于记忆跟你说话的第一句」
        → 返 { materials, modelRequest, modelResponse, opening, warnings }

核心（三个 lib/flow/ 文件）：
  lib/flow/compress.ts
    compressSession(text)  ← 7-A 整段 → 会话摘要
    mergeFactsToImage(userId, keys)  ← 7-C 多条 → 画像 + 7-D 自动合并共用
  lib/flow/capacity-merge.ts
    getCapacityConfig / setCapacityConfig  ← 阈值读写
    checkCapacity  ← 算库总字符数 + 零碎事实 key 列表 + 是否超限
    writeAndCheck  ← 写事实 → 检查 → 超阈自动合并（核心一跳）
  lib/flow/recall-preview.ts
    recallPreview(userId)  ← 7-E 召回 + 拼 prompt + 大模型说话

复用 step-11 的 lib/db.ts + 新增 summary 列（存每条事实的「压缩结果」字段）。
路由按业务相关度拆六个 route 文件（§5.3.8）：
  - POST /api/compress-session（routes/compress-session.ts）
  - POST /api/compress-image  （routes/compress-image.ts）
  - GET  /api/capacity + POST /api/capacity/config（routes/capacity-get.ts + routes/capacity-config.ts）
  - POST /api/auto-merge/write（routes/auto-merge-write.ts）
  - GET  /api/library（routes/library.ts；给 auto-merge / 调取预览页实时刷新库状态用）
  - POST /api/recall-preview（routes/recall-preview.ts；变体 7-E）
本步不开新 step-N+1（按 §5.3.14「改动很小」例外）；同 demo 同端口同一 lib/flow/ 核心。
```

## 当前能做什么

| sub-page | 入口 | 演示什么 | 覆盖变体 |
| --- | --- | --- | --- |
| 总览 | `/` | 笔记 §6 三个层次 + §7 容量上限设计原则 + 本步四个 sub-page | — |
| 第二层 · 整段 → 会话摘要 | `/pages/compress-session.html` | 灌入示例 → 压缩对话原文（亮出 modelRequest/modelResponse/压缩比/漏掉的细节「花生过敏」） | 变体 7-A |
| 第三层 · 多条 → 画像 | `/pages/compress-image.html` | 灌入示例 → 合并 5 条零碎事实成画像（同样亮出完整交互） | 变体 7-C |
| 变体 7-D · 库容量上限 + 自动合并 | `/pages/auto-merge.html` | 灌入示例 → 设阈值（如 60 字符）→ 写新事实 → 超阈自动合并零碎事实到 user_profile_auto + 归档 | 变体 7-D |
| 变体 7-E · 跨会话验证 + 调取预览 | `/pages/recall-preview.html` | 灌入示例 → 调大模型基于库里素材生成开场白（亮出素材 + modelRequest + modelResponse） | 变体 7-E |

四个 sub-page 各自独立——三个「写入侧」（整段摘要 / 多条画像 / 自动合并）+ 一个「召回侧」（调取预览）。手动合并写到 user_profile_v1，自动合并写到 user_profile_auto，key 不同互不干扰。

## 当前未做

- **变体 6-A / 6-B / 6-C 演示**：本步不复刻 step-10 已有内容；跑 `yarn app:10-02-write-policy-step-10` 看 6-A / 6-B / 6-C
- **变体 6-D 演示**：本步不复刻 step-11 已有内容；跑 `yarn app:10-02-write-policy-step-11` 看 6-D
- **库容量上限 cron 自动触发**：本步演示按钮触发代替 cron 定时——满足笔记 §7 设计原则，但生产里通常用 cron / 后台任务每 N 分钟扫一次（不阻塞写动作）
- **需求 8 · 审计与安全**（投毒拦截 + 可审计 + 幂等 + 一键撤回）：留给更后面的 step

## 跑完看什么

页面启动时会在 `apps/10-Memory/02-写入策略-step-12/logs/{YYYY-MM-DD}.log` 写日志。烟雾测试：

```bash
cd apps
PORT=31015 npx tsx 10-Memory/02-写入策略-step-12/server.ts
# 起服务后另开终端:
sleep 4 && ls -lh apps/10-Memory/02-写入策略-step-12/logs/$(date +%Y-%m-%d).log
```
