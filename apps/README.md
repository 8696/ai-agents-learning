# 小节 Demo + 模块 00 Mini App

`apps/` 是本仓库**唯一的代码落点**——所有外部小节的最小可运行样例 + 模块 00 的代码落点（[AGENTS.md §5](../AGENTS.md#5-demo-落点)）。

模块 00 的代码落在 `00-环境准备/01-mini-app-step-1/`；其余模块按条 Demo 落到各自小节。**模块复盘不写代码**（[AGENTS.md §7.3](../AGENTS.md#73-模块复盘进度表最后一行)）。

| | 这里 `apps/` |
| - | ------------- |
| 干什么 | 单条知识点验证 + 模块 00 最小闭环 |
| 彼此 | 子文件夹互不 import |
| Key | 只读 `apps/.env`：顶层 `LLM_PROVIDER` 切家、顶层 `LLM_MODEL` 覆盖该家默认模型；各家 Key/Base URL/默认模型按分组（`MINIMAX_*` / `ZHIPU_*` / `DEEPSEEK_*` / `QWEN_*` / `CUSTOM_*`）。Demo 用 `apps/llm.ts` 的 `getLlm()` / `getLlmOptional()`，**不要在小节里写死供应商**。新增一家提供商：[AGENTS.md §5.0.x](../AGENTS.md#50x-扩展-llm-提供商catalog)——`apps/llm.ts` 的 `CATALOG` 加项 + `apps/.env.example` 加段 |

**学到该条、判断为「可运行」才建对应文件夹。** 不要提前建空目录。

**本表是已落地 Demo 的唯一清单**（脚本名 / 端口）。新建对照 [AGENTS.md §5](../AGENTS.md#5-demo-落点) 的骨架，不要把本表某条当模板去抄。改端口时改这里和 `package.json`，不要抄进 `AGENTS.md`。

**新建 / 改口 5 步 checklist**：[AGENTS.md §5.3.3](../agents/05-demo.md#533-目录与脚本) —— ① 查本表最大端口 M → ② 新口 = M+1 → ③ 同步 `runtime-ctx.ts` / `layout.js` / 本表 / demo README 四份 → ④ `node scripts/check-demo.cjs` 过 → 再 `cd apps && yarn typecheck` → ⑤ 完工。写完 Demo 的完整验收顺序见 [05-demo 写完后验收顺序](../agents/05-demo.md#写完后验收顺序)。

当前已有：

| 跑 | 默认端口 | 对应小节 |
| -- | -------- | -------- |
| `yarn app:00-01-mini-app-step-1` | `50000` | 模块 00 mini-app · HTTP + SSE |
| `yarn app:00-01-api-key-billing-step-1` | `50001` | 输入 / 输出 Token 分开 |
| `yarn app:01-02-token-step-1` | `50002` | 中英文 Token 数（本地 encode，不调 LLM） |
| `yarn app:01-06-embedding-step-1` | `50003` | 玩具向量：Token ID 减不出远近，余弦能排出谁近（不调 LLM） |
| `yarn app:01-07-temperature-step-1` | `50004` | 同一 prompt，温度 0 vs 1.2 |
| `yarn app:02-01-streaming-sse-step-1` | `50005` | SSE 帧长什么样 + 流式 vs 一次性 TTFT 对照 |
| `yarn app:02-02-protocol-ab-step-1` | `50006` | 同 Key 跑协议 A vs B（具体模型看 `apps/.env` 的 `LLM_MODEL`） |
| `yarn app:02-03-adapter-step-1` | `50007` | 适配层：业务只调 sendMessage（同小节第二份 HTTP Demo） |
| `yarn app:02-03-abort-controller-step-1` | `50008` | AbortController 三端点对照 |
| `yarn app:02-04-rate-limit-step-1` | `50009` | 429 / Rate Limit 五场景时间线 |
| `yarn app:02-05-thinking-step-1` | `50010` | 四家官方思考方言（MiniMax / 智谱 / DeepSeek / 千问）× 协议 A/B：怎么开、怎么关、回哪个字段 |
| `yarn app:03-01-system-user-assistant-priority-step-1` | `50011` | System / User / Assistant 优先级 + 多轮 |
| `yarn app:03-02-few-shot-zero-shot-step-1` | `50012` | 同一评价任务：Zero-shot vs Few-shot |
| `yarn app:03-04-prompt-versioning-diff-step-1` | `50013` | 一字之差：v1.0.0 vs v1.1.0 看行为影响 |
| `yarn app:04-01-json-schema-step-1` | `50014` | Zod 端：parse/safeParse/issues/transform（本地，不调 LLM） |
| `yarn app:04-02-json-mode-vs-structured-output-step-1` | `50015` | 同 prompt × 5 用例，JSON Mode vs Structured Output strict 并排；⑥ strict schema 写法不对 → API 400 |
| `yarn app:04-02-anthropic-tool-use-step-1` | `50016` | 协议 B 镜像版：text（无 tools）vs tool-use（强制 tool_choice）并排；⑥ prompt 诱导模型违 input_schema，看守约（同小节第二份 HTTP Demo；脚本名沿用真实小节号 04-02，端口按占用表顺序） |
| `yarn app:05-01-fc-protocol-step-1` | `50017` | Function Calling 协议完整一圈（含并行调用 · step-1 sketch 不调 LLM，mock 数据；锁定时再补 §5.3.2 6 项） |
| `yarn app:05-01-fc-protocol-step-2` | `50018` | step-2 真 LLM（协议 A · openai.chat.completions）；两轮调用 + 请求/响应全量前端可视化（copy step-1 + 加 lib/llm/protocol-a.ts） |
| `yarn app:05-01-fc-protocol-step-3` | `50019` | step-3 并行调用（mock · 不调 LLM）；3 个 async Tool + Promise.all + gantt 时序图 + 串/并行对比按钮（修 §5.4.A2 阻塞） |
| `yarn app:05-01-fc-protocol-step-4` | `50020` | step-4 串行依赖链（mock · 不调 LLM）；search_doc → summarize（B 用 A 的输出当参数）；await 链式 + gantt 时序图 + final summary |
| `yarn app:05-01-fc-protocol-step-5` | `50021` | step-5 模型自编排（mock · 不调 LLM）；while + decideNextAction mock LLM + 自纠触发（query 太短 → 扩 query 重试）+ MAX_ROUNDS 边界 |
| `yarn app:05-01-fc-protocol-step-6` | `50022` | step-6 真 LLM（协议 A · openai.chat.completions）；两轮调用 + 4 张数据卡全量可视化 + 路由层 detectHallucination 自动扫 reply 数字 vs tool_result 数字差异 |
| `yarn app:05-01-fc-protocol-step-7` | `50023` | step-7 混合编排（mock · 不调 LLM）；路由层 hard-code 两条约束（拒绝越权 + 路径 B 硬接）+ 模型决定要不要进两步链；3 条路径（A 仅 weather / B weather+硬接 suggest / C 直接打包被拒→退回） |
| `yarn app:05-01-fc-protocol-step-8` | `50024` | step-8 协议 B（真 LLM · Anthropic Messages API）；单协议 B · 4 张数据卡全量可视化 + 字段差异对照表（协议 A step-6 vs 协议 B step-8）；不做协议 A vs B 同页并排（§5.3.13 硬约束 · 本条不是"对照"教学点；字段并排对照是模块 02-02 教学点） |
| `yarn app:05-02-description-step-1` | `50025` | 模块 05 · 02 · Tool Description 对照实验：同 query 配「差描述 / 好描述」两套 Tool 各调一次模型，对照 tool_call 选择（变体 1「触发条件」实证） |
| `yarn app:05-02-description-step-2` | `50026` | 模块 05 · 02 · Tool Description step-2：单 Tool · 唯一差异 = order_id 字段有无 description；user 用城市名当订单号，看模型是否瞎填（变体 2「参数语义」实证） |
| `yarn app:05-02-description-step-3` | `50027` | 模块 05 · 02 · Tool Description step-3：单 Tool · 唯一差异 = query_logistics.description 含不含「不要用于查订单详情」反例；user 问订单地址，看模型是否瞎调（变体 3「反例」实证） |
| `yarn app:05-02-description-step-4` | `50028` | 模块 05 · 02 · Tool Description step-4：单 Tool · 唯一差异 = query_logistics.description 含不含 1 个 few-shot 示例；user 问模糊订单号，看模型是否按示例规范填（变体 4「少样示例」实证） |
| `yarn app:05-02-description-step-5` | `50029` | 模块 05 · 02 · Tool Description step-5：单 Tool · 唯一差异 = priority 字段是否用 enum 限定 ['low','medium','high']；user 问"急"类 query，看模型幻觉 enum 外值 vs 稳填 enum 内（变体 5「Enum 约束」实证） |
| `yarn app:05-02-description-step-6` | `50030` | 模块 05 · 02 · Tool Description step-6：同 Tool schema · 唯一差异 = 协议 A `openai.chat.completions` vs 协议 B `anthropic.messages`；验证「step-1~5 综合最优 Tool schema」跨 Provider 是否通用（变体 6「跨 Provider 兼容」实证） |
| `yarn app:05-03-tool-choice-step-1` | `50031` | 模块 05 · 03 · Tool Choice step-1：同 tools + 同 query，前端切换 auto/none/required；三档结果常驻对照 hasToolCalls（变体 1–3 起手） |
| `yarn app:05-03-tool-choice-step-2` | `50032` | 模块 05 · 03 · Tool Choice step-2：双 Tool（物流+天气）；required 任选 vs 钉死 name；对照 firstToolName（变体 4） |
| `yarn app:05-03-tool-choice-step-3` | `50033` | 模块 05 · 03 · Tool Choice step-3：产品开关「只聊天/允许工具/强制查库」→ none/auto/required 映射（变体 5） |
| `yarn app:05-04-tool-gateway-step-1` | `50034` | 模块 05 · 04 · Tool Gateway step-1：协议 B（Anthropic Messages API）真 LLM + delete_user Gateway 三钩子（鉴权 / 配额 / 危险）+ 二次确认（变体 1） |
| `yarn app:05-04-tool-gateway-step-2` | `50035` | 模块 05 · 04 · Tool Gateway step-2：变体 2 create_order 幂等（调 LLM 协议 B · 同 idempotency_key 调 3 次 /api/chat → DB 只插 1 行） |
| `yarn app:05-04-tool-gateway-step-3` | `50036` | 模块 05 · 04 · Tool Gateway step-3：变体 3 read_recent_emails 委托授权（调 LLM 协议 B · per-user OAuth + fail-closed + 未 OAuth 拒绝） |
| `yarn app:05-04-tool-gateway-step-4` | `50037` | 模块 05 · 04 · Tool Gateway step-4：变体 4 Tool 抛错结构化（调 LLM 协议 B · 3 按钮演示成功 / 业务错 / 参数错 → handler throw → 结构化错误 → Round 2 模型改输入） |
| `yarn app:06-01-context-vs-memory-step-1` | `50038` | 模块 06 · 01 · Context vs Memory step-1：最小可观察；输入框 + 发送 / 清空 + 真 LLM（协议 A）；messages 数组即 Context，服务端日志写完整 messages + token 估算；演示 Context 累积与「清空 = Context 消失」（step-1 sketch） |
| `yarn app:06-01-context-vs-memory-step-2` | `50039` | 模块 06 · 01 · Context vs Memory step-2：Memory 持久化（SQLite · `data/preferences.db` · §5.3.17 KV 抽象 `kvGet/kvSet/kvDel/kvList`）；POST /api/memory 写入偏好 + GET /api/memory 列出 + DELETE /api/memory 删除；每次发送从 db 读偏好注入 system 末尾；服务端日志 `data.fromMemory` + `request.messages[0]` 完整可见；前端 React state 看不到 Memory 段；跨会话还记：关浏览器再发仍按偏好回答 |
| `yarn app:06-02-compress-vs-window-step-1` | `50040` | 模块 06 · 02 · 压缩 / 摘要 vs 滑动窗口 step-1：滑动窗口（按条数 K + system pin）对照实验；50 轮假历史 + 1 轮「自我介绍」含 key fact + 1 轮「你还记得吗」；调真模型 #1（完整）→ beforeReply + 滑动窗口裁剪 → 调真模型 #2（裁剪后）→ afterReply；三张卡：① 裁剪前 messages + beforeReply  ② 裁剪后 messages + afterReply  ③ 对比小结（key fact 在 / 不在）；step-1 sketch：跑滑动窗口这一条策略的「丢了什么」 |
| `yarn app:06-02-compress-vs-window-step-2` | `50041` | 模块 06 · 02 · 压缩 / 摘要 vs 滑动窗口 step-2：摘要压缩（远期 N 条 → 调 LLM 浓缩成 1 条 summary + 近 K 条留原文）；同 50 轮假历史，调真模型 3 次（before 基线 + 远期摘要 + after 验证）；四张卡：① 裁剪前 ② summary 内容（看 LLM 写了啥） ③ 摘要后 ④ 对比小结；step-2 sketch：跑摘要压缩这一条策略的「保留了什么」 |
| `yarn app:06-02-compress-vs-window-step-3` | `50042` | 模块 06 · 02 · 压缩 / 摘要 vs 滑动窗口 step-3：双策略并跑 · 三方对照 · 一页 4 次真调模型（完整 + 滑动窗口 + 摘要 + 摘要后问答）；同份 50 轮假历史 + 同一问句 + 同一模型 → 五张卡：① 完整（基线） ② 滑动窗口（按条数 K + system pin） ③ 摘要压缩（远期 summary + 近期原文） ④ summary 内容 ⑤ 三方对比小结；标准结果：full ✅ / sliding ❌ / summarize ✅ → 「丢字面 vs 留语义」可观察对照（覆盖需求 4「对比演示页」） |
| `yarn app:06-02-compress-vs-window-step-4` | `50043` | 模块 06 · 02 · 压缩 / 摘要 vs 滑动窗口 step-4：失败兜底降级 · 同 step-3 三方对照 + 1 个「模拟摘要失败」开关；摘要 LLM throw → catch → fallback 标记 used=true → 用滑动窗口答题（仍 200）；服务端日志 warn「摘要失败，降级为滑动窗口」；用户感知不到失败；点「演示上游失败」→ 5xx 红字（与兜底降级形成对照）；覆盖需求 5「摘要失败兜底降级」 |
| `yarn app:06-02-compress-vs-window-step-5` | `50044` | 模块 06 · 02 · 压缩 / 摘要 vs 滑动窗口 step-5：按 token 算窗口（变体 2）· 滑动窗口 K 从「条数」换成「token 数」（gpt-tokenizer 估算）；从最新往旧累加 ≤ B 为止；system pin；同份假历史 + 同一问句 + 同一模型 → 五张卡：① 完整 ② 滑动窗口（按 token B={B}） ③ 摘要压缩 ④ summary 内容 ⑤ 「按 token vs 按条数」对照；token 硬上限 = 生产里最稳的硬控制方式（不受单条超长消息影响） |
| `yarn app:06-03-token-budget-step-1` | `50045` | 模块 06 · 03 · Token Budget step-1：三块预算分账（system / history / output）+ 拼装前打印 token + 超预算丢最旧非 system 消息 + 调真模型一次；前端 4 卡对照（触发说明 / 裁前裁后预算 / 完整 messages / 模型回复）；覆盖需求 1「三块预算分账」+ 需求 5「完整 messages 打印」 |
| `yarn app:06-03-token-budget-step-2` | `50046` | 模块 06 · 03 · Token Budget step-2：双策略对照 — 方法一「直接丢最旧 / trim」vs 方法二「远期摘要 + 近期原文 / summarize」；同 query 同模型同 history 走两条路径 3 次真发网络请求（1 摘要 + 2 问答）+ KEY_FACT 检测（肯定句式 + 否定标记）；前端 4 卡（对比小结 / 方法一 / 方法二 + summary 原文 / 裁前基线）；覆盖需求 3「滑动窗口 vs 摘要 效果对比」+ 需求 5 |
| `yarn app:06-03-token-budget-step-3` | `50047` | 模块 06 · 03 · Token Budget step-3：软阈值+硬阈值两层（soft / emergency）· 同 history 走两条路径 — total ≤ hardLimit 走软路径（trim 或 summarize 二选一）；total > hardLimit 走硬路径 = 应急模式（只留 system + history 末轮 + 提示「请用一句话重述」）；覆盖需求 6「50+ 轮长对话不崩」 |
| `yarn app:06-03-token-budget-step-4` | `50048` | 模块 06 · 03 · Token Budget step-4：选择性注入 — 5 段多话题 history（美食/天气/工作/电影/健身 × 10 轮）+ query 关键词匹配 → 只 top-N 命中段塞进 messages（其他不进）；对照全塞基线；2 次真发网络请求（1 全塞 + 1 选择性）；覆盖需求 4「选择性注入」+ 需求 7「全塞 vs 选择性对比」 |
| `yarn app:07-01-agent-loop-react-step-1` | `50049` | 模块 07 · 01 · Agent Loop / ReAct step-1：手写 while 跑一整轮 Loop（变体 H 多圈 + D 串行依赖 + J 最终答案）+ 副作用三栏可见（before / after / diff）；默认 query 「把逾期购物待办标完成」→ 期望 ≥2 圈（list_todos → complete_todo ×N）→ 最后一圈无 tool_calls → 绿卡最终答案；trajectory 按圈展开 + 完整 messages 可展开；类 A 4xx 空字符串 + 类 B 5xx 演示端点 |
| `yarn app:07-01-agent-loop-react-step-2` | `50050` | 模块 07 · 01 · Agent Loop / ReAct step-2：变体 E 一圈多个 Act 并行（Promise.all）—— query「一次性把逾期购物待办都标完成」逼模型一轮返回多个 complete_todo；前端对照「真并行耗时 max vs 串行总耗时 sum」+ 节省 ms（handler 模拟 50~250ms 延时让差异肉眼可见） |
| `yarn app:07-01-agent-loop-react-step-3` | `50051` | 模块 07 · 01 · Agent Loop / ReAct step-3：变体 G 失败 Observe 后继续 —— query「把 todo-999 标完成」故意触发 handler 返回 `{ok:false,error:'not_found'}` → 错误进 messages → 下一圈模型改参 → 成功 → 最终答案；前端「失败观察后改参」卡片统计 failedCount + 首末失败 round；对照「handler throw = Loop 死」vs「返回结构化错误 = Loop 自纠」 |
| `yarn app:07-01-agent-loop-react-step-4` | `50052` | 模块 07 · 01 · Agent Loop / ReAct step-4：变体 M 用户取消 —— POST /api/agent-run 立刻返 202 + runId（不阻塞）→ 前端轮询 GET 拿结果 → 「🚫 取消」按钮发 POST /api/cancel/:runId → 后端 AbortController.abort() → 下一次 LLM 调用抛 AbortError → while 检测 signal.aborted → break + stoppedReason="cancelled"；trajectory 完整保留；状态徽标三态 ✅/⚠/🚫 |
| `yarn app:07-02-plan-vs-step-step-1` | `50053` | 模块 07 · 02 · 先规划再执行 vs 一步步走 step-1：双栏对照（mock 模型 + mock 工具 · 不调真 LLM）—— 左栏 GET /api/step-by-step、右栏 GET /api/plan-and-execute（两侧分请求；「同时对照」浏览器两次 fetch）；一步步走 7 圈 vs 先规划 1 次 + 6 步执行；关键差异卡 3 行：模型调用次数 / 第一次 Act 前等待 / 计划作为对象 |
| `yarn app:07-02-plan-vs-step-step-2` | `50054` | 模块 07 · 02 · 先规划再执行 vs 一步步走 step-2：全真模型 —— 两侧分请求；A 路径每圈真调一次模型（最多 MAX_ROUNDS=8）+ B 路径真规划器一次吐清单；plannerFallback=true 时 B 解析失败回退 mock plan + 标 ⚠ 兜底 |
| `yarn app:07-02-plan-vs-step-step-3` | `50055` | 模块 07 · 02 · 先规划再执行 vs 一步步走 step-3：加重规划 —— 两侧分请求；B 路径执行阶段每步后 shouldReplan 检测关键变化（默认：所有 SKU query_stock 库存 0）→ 触发就再调真规划器吐 v2 plan；UI 能看见「计划 v1（已废灰卡）→ 计划 v2（绿卡）」 |
| `yarn app:07-02-plan-vs-step-step-4` | `50056` | 模块 07 · 02 · 先规划再执行 vs 一步步走 step-4：短任务 vs 长任务对照 —— 四组各自请求（`?task=short\|long` × 一步步走 / 先规划）；变体 D：短任务 B 多付 1 次规划（不值得）/ 长任务 B 更省模型调用（值得） |
| `yarn app:07-02-plan-vs-step-step-5` | `50057` | 模块 07 · 02 · 先规划再执行 vs 一步步走 step-5：变体 E 演示 —— 两侧分请求；mock write_copy 第 1 次调用强制返回 `{ok:false}`；shouldReplan 不看 ok=false → 按旧清单继续做错；UI 执行卡标黄「⚠ 变体 E 触发」 |
| `yarn app:07-02-plan-vs-step-step-6` | `50058` | 模块 07 · 02 · 先规划再执行 vs 一步步走 step-6：变体 F 演示 —— GET /api/plan 只规划（status=pending）→ 用户点确认 → POST /api/confirm-plan 只执行已保存计划（禁止再跑 A）；左栏独立 GET /api/step-by-step；UI 状态机 idle → planned → executed；确认前无副作用 |
| `yarn app:07-03-loop-guard-step-1` | `50059` | 模块 07 · 03 · 死循环防护 step-1：反例 vs max iterations 闸门 · 两按钮分请求 · 数字面板并排对照 stepCount / tokenEstimate / stoppedReason（mock 模型 + mock 工具 · 不调真 LLM · 走 §5.3.0 例外「纯协议形状演示」） |
| `yarn app:07-03-loop-guard-step-2` | `50060` | 模块 07 · 03 · 死循环防护 step-2：max iterations 单闸 vs timeout 单闸 vs 双闸叠加 · 三按钮分请求 · 数字面板对照 stepCount / elapsedMs / stoppedReason（latency/轮参数让 timeout 闸能真触发） |
| `yarn app:07-03-loop-guard-step-3` | `50061` | 模块 07 · 03 · 死循环防护 step-3：max iterations + timeout + model_says_stop 三闸叠加 + 真模型调（按钮 ③④ 真调模型看 finish_reason） |
| `yarn app:07-03-loop-guard-step-4` | `50062` | 模块 07 · 03 · 死循环防护 step-4：用户取消 闸（AbortController · 变体 4）· 启 run 后立刻返 runId · 用户点取消 → controller.abort() → runLoop break |
| `yarn app:07-03-loop-guard-step-5` | `50063` | 模块 07 · 03 · 死循环防护 step-5：工具重试上限 闸（变体 5）· 偶发失败（flakyRate=0.5 · 3 次重试）vs 100% 失败（重试 3 次后降级 tool_retry_cap） |
| `yarn app:07-03-loop-guard-step-6` | `50064` | 模块 07 · 03 · 死循环防护 step-6：同工具循环检测 闸（变体 6）· mock 模型永远调 SKU-LOOP → 连续 N 次同工具同参数 → tool_call_loop |
| `yarn app:07-03-loop-guard-step-7` | `50065` | 模块 07 · 03 · 死循环防护 step-7：token 预算 闸（变体 7）· mock 模型每轮调不同 sku → 累计 token 超预算 → token_budget |
| `yarn app:07-03-loop-guard-step-8` | `50066` | 模块 07 · 03 · 死循环防护 step-8：todo 助手端到端（真模型）· 业务选型 7 闸面板（checkbox 控制每闸装/不装 · 一键「4 道」「7 道」） |
| `yarn app:08-01-rag-pipeline-step-1` | `50067` | 模块 08 · 01 · RAG 流水线 step-1：一份售后 Markdown 拆成多行（Load → Chunk → Embed）再提问检索生成 |
| `yarn app:08-01-rag-pipeline-step-2` | `50068` | 模块 08 · 01 · RAG 流水线 step-2：Markdown / PDF 文件上传入库 + 按 source 整份先删后建（多份文件共存） |
| `yarn app:08-01-rag-pipeline-step-3` | `50069` | 模块 08 · 01 · RAG 流水线 step-3：检索做成工具（Agent 自己写最小循环决定要不要搜） |
| `yarn app:08-01-rag-pipeline-step-4` | `50070` | 模块 08 · 01 · RAG 流水线 step-4：答准时修法提示 UI（5 类症状 + 行级/全量/不动库） |
| `yarn app:08-01-rag-pipeline-step-5` | `50071` | 模块 08 · 01 · RAG 流水线 step-5：PDF 按页段 + 命中卡片显示页码 |
| `yarn app:08-02-chunking-step-1` | `50072` | 模块 08 · 02 · 切块（Chunking）step-1：三栏对照 size / overlap / 切法差异；纯本地文本操作，不调 LLM |
| `yarn app:08-02-chunking-step-2` | `50073` | 模块 08 · 02 · 切块（Chunking）step-2：单位对照 + 兜底截断 + size×Top-K 撞预算；纯本地文本操作，不调 LLM |
| `yarn app:08-02-chunking-step-3` | `50074` | 模块 08 · 02 · 切块（Chunking）step-3：怎么判断切得好不好 + 5 种文档类型选不同策略；纯本地文本操作，不调 LLM |
| `yarn app:08-02-chunking-step-4` | `50075` | 模块 08 · 02 · 切块（Chunking）step-4：PDF 按页切 + 跨页段落腰斩可见 + 页码元数据；纯本地文本操作，不调 LLM |
| `yarn app:08-02-chunking-step-5` | `50076` | 模块 08 · 02 · 切块（Chunking）step-5：递归切分完整版（## → 段落 → 句号 → 硬切兜底四级显式降级）；纯本地文本操作，不调 LLM |
| `yarn app:08-02-chunking-step-6` | `50077` | 模块 08 · 02 · 切块（Chunking）step-6：综合对比收尾 · step-1 ~ step-5 各 demo 能力回顾；纯本地展示，不调 LLM |
| `yarn app:08-02-chunking-step-7` | `50078` | 模块 08 · 02 · 切块（Chunking）step-7：atomic 块保护（表格 / 代码围栏 / 编号条款整块保留 + 超上限兜底说明）；纯本地文本操作，不调 LLM |
| `yarn app:08-03-cosine-similarity-step-1` | `50079` | 模块 08 · 03 · 余弦相似度 step-1：六 page 一站（① 余弦对照 / ② Top-K 截断 / ③ Top-K + 阈值弃权 / ④ 跨模型重标定 / ⑤ 距离排序对照 / ⑥ 归一化）；同向不同长的二维教学向量（含真近义句 + 冲突政策），三把尺子分请求对照；纯本地计算，不调 LLM |
HTTP 端口规则见 [AGENTS.md §5.3.3](../AGENTS.md#533-目录与脚本)：从 `50000` 起**顺序分配**，新增 Demo = `max(占用表) + 1`；删 demo 不回收口。建前先查本表，禁止撞口；不要把 `PORT` 写进共享 `apps/.env`。

HTTP Demo 一律 §5.3 全栈版（**包括不调 LLM 的本地计算**）：`server.ts` 只装配；业务在 `routes/` + 分层 `lib/`；浏览器 `GET /` 是总览，独立场景在 `/pages/`；页脚 `#env-info` 来自 `GET /health`。不调模型的条加 `callsModel: false`，主按钮不因缺 Key 而 disabled。各条 README 写该条页面清单。禁止小节 CLI。

```bash
cd apps
yarn install
yarn app:00-01-mini-app-step-1     # 例：模块 00 mini-app 跑通
```

脚本名必须是 `app:{模块两位}-{小节两位}-{英文短名}-step-{N}`，新建可运行 Demo 时写进 `package.json`（[AGENTS.md §5.2](../AGENTS.md#52-小节-demo) + [agents/05-demo.md §5.3.14](agents/05-demo.md#5314-demo-子节拆分动态引导由浅入深新)）；代码落在 `apps/{模块文件夹}/{小节文件夹}-step-{N}/`（**扁平结构**：`-step-N` 直接拼到小节文件夹名后缀，多个 step 是同模块下的兄弟文件夹；`{N}` 起步为 `1`，动态追加）。**无例外**——模块 00 mini-app 也走这套（`app:00-01-mini-app-step-1` → `00-环境准备/01-mini-app-step-1/`）。

模块文件夹名与 `docs/学习模块/` 下的文件夹同名；小节文件夹名与该条小节 MD 文件名去掉 `.md` 相同。
