# 记忆分类 · 第四步（完整 4 步拼装 + 多轮对话 + 程序性常驻区）

对应学习笔记：[docs/学习模块/10-Memory/01-记忆分类.md](../../docs/学习模块/10-Memory/01-记忆分类.md)

## 现在怎么跑

```bash
cd apps
yarn app:10-01-memory-types-step-4
```

浏览器打开：http://127.0.0.1:50103/

端口：`50103`（yarn 脚本 inline `PORT=50103`；`lib/http/runtime-ctx.ts` `.default(50103)` 兜底）

## 本步核心

把 step-1~3 那条线补完 —— 一次完整请求 = 4 步拼装：

```text
用户敲下一句话
        │
        ├─① 程序性记忆（全员规则，常驻不检索，每次都带）
        │     从内存 Map 读出全部规则 → 拼进 system 段开头
        │
        ├─② 语义 / 情景召回（按相关性召回）
        │     调嵌入接口 + 余弦 + Top-K=3 + 阈值弃权（默认 0.10）
        │     → 拼进 system 段「关于这个用户你需要知道的」
        │
        ├─③ 工作记忆累积（多轮 messages 数组，本来就在）
        │     整个 messages 数组由前端传进来，包含历史 user/assistant 轮次
        │
        ▼
   拼成最终 messages ──→ 真发网络请求调模型 ──→ 模型返回答复
```

**关键点**：
- 三类记忆走三条不同路径，最后都拼到 messages 数组里送进模型
- 「每轮独立判断要不要召回」：闲聊 / 计算 / 上下文追问 → 不读记忆库；跨会话事实 / 偏好类问题 → 跑嵌入余弦
- 「程序性 vs 用户记忆必须分开存」：清空用户事实不能误删规则；改一条规则必须对所有用户生效（in-memory 共享）

## 数据流

```text
用户点「发一条」或「5 句连问」
    → 拼接 messages = 历史 + 本轮 user
    → POST /api/chat { messages, currentQuery, toggles? }
    → 服务端 runFullPipeline：
         ① listRules() → 程序性规则拼进 system 段
         ② runRetrieval(query, 3, 0.10, disableSet) → Top-K + 阈值弃权
            （toggles.skipRecall === true 时跳过 ②）
         ③ historyNoSystem = 前端 messages 过滤掉 system
         ④ 拼 system + history → messages 数组 → 调协议 A 对话补全
    → 返回 { finalMessages, programRuleCount, recall, modelRequest, modelResponse, modelAnswer, durationMs }
    → 页面：
        ① 程序性常驻区（黄框 · 改一条规则下次立刻生效）
        ② 工作记忆累积面板（messages 数组逐轮追加）
        ③ 召回决策列表（5 句连问每轮的「跑了哪类 / Top-K 大小 / 模型回答」）
        ④ 单句问回答 + 完整模型请求（含 messages 拼装结果）
```

## 当前能做什么

- 输入任意一句 user 消息，点「发一条」调 `/api/chat`，助手回答自动追加进 messages 历史
- 点「5 句连问」按 MD §8 表的顺序发 5 条 user 消息，每条独立判断要不要召回：
   - ① 你好 → 不召回（闲聊）
   - ② 我用什么框架？ → 语义召回（Top-K 命中「我们组用 Vue 3」）
   - ③ 刚才那条记下了吗？ → 不召回（看 messages 数组）
   - ④ 我叫什么名字？ → 召回（事实库里没名字 → Top-K 空 + 阈值弃权）
   - ⑤ 123×456 等于多少 → 不召回（纯算术）
- 程序性常驻区：默认 3 条规则（"先给结论再给代码" / "单文件组件" / "删操作前确认"），可新增 / 删除；改一条规则下一次回答立刻生效
- 「清空用户记忆」按钮 → DELETE /api/facts（仅清空事实库，程序性规则原封不动）
- 「结束会话」按钮 → 清空 messages 工作记忆历史
- 「跳过整个召回」toggle → 演示「不读记忆库」分支（仅调模型）
- 缺密钥 → 503 NO_KEY；演示后端 5xx → 演示另一条失败通道

## 与 step-1 / step-2 / step-3 的关系

- step-1（端口 50100）：分类本身，不持久化
- step-2（端口 50101）：分类 + 写入到 data/facts.json + 重启验证（事实库从这里来）
- step-3（端口 50102）：从 step-2 的事实库按余弦相似度召回 + 拼 Prompt + 调大模型（嵌入余弦 + 阈值弃权）
- step-4（本步）：完整 4 步拼装（程序性常驻 + 语义/情景召回 + 工作记忆累积 + 调模型）+ 多轮对话 + 5 句连问
- 四个 demo 互不依赖；step-4 假设事实库已有内容（建议先跑 step-2 落几条再回 step-4）