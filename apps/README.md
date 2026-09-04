# 小节 Demo + 模块 00 Mini App

`apps/` 是本仓库**唯一的代码落点**——所有外部小节的最小可运行样例 + 模块 00 的代码落点（[AGENTS.md §5](../AGENTS.md#5-demo-落点)）。

模块 00 的代码落在 `00-环境准备/01-mini-app-step-1/`；其余模块按条 Demo 落到各自小节。**模块复盘不落代码**（[AGENTS.md §7.3](../AGENTS.md#73-模块复盘进度表最后一行)）。

| | 这里 `apps/` |
| - | ------------- |
| 干什么 | 单条知识点验证 + 模块 00 最小闭环 |
| 彼此 | 子文件夹互不 import |
| Key | 只读 `apps/.env`：顶层 `LLM_PROVIDER` 切家、顶层 `LLM_MODEL` 覆盖该家默认模型；各家 Key/Base URL/默认模型按分组（`MINIMAX_*` / `ZHIPU_*` / `DEEPSEEK_*` / `QWEN_*` / `CUSTOM_*`）。Demo 用 `apps/llm.ts` 的 `getLlm()` / `getLlmOptional()`，**不要在小节里写死供应商**。新增一家提供商：[AGENTS.md §5.0.x](../AGENTS.md#50x-扩展-llm-提供商catalog)——`apps/llm.ts` 的 `CATALOG` 加项 + `apps/.env.example` 加段 |

**学到该条、判断为「可运行」才建对应文件夹。** 不要提前建空目录。

**本表是已落地 Demo 的唯一清单**（脚本名 / 端口）。新建对照 [AGENTS.md §5](../AGENTS.md#5-demo-落点) 的骨架，不要把本表某条当模板去抄。改端口时改这里和 `package.json`，不要抄进 `AGENTS.md`。

**新建 / 改口 5 步 checklist**：[AGENTS.md §5.3.3](../agents/05-demo.md#533-目录与脚本) —— ① 查本表最大端口 M → ② 新口 = M+1 → ③ 同步 `runtime-ctx.ts` / `layout.js` / 本表 / demo README 四份 → ④ `node scripts/check-demo.cjs` 过 → ⑤ 完工。

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

HTTP 端口规则见 [AGENTS.md §5.3.3](../AGENTS.md#533-目录与脚本)：从 `50000` 起**顺序分配**，新增 Demo = `max(占用表) + 1`；删 demo 不回收口。建前先查本表，禁止撞口；不要把 `PORT` 写进共享 `apps/.env`。

HTTP Demo 一律 §5.3 全栈版（**包括不调 LLM 的本地计算**）：`server.ts` 只装配；业务在 `routes/` + 分层 `lib/`；浏览器 `GET /` 是总览，独立场景在 `/pages/`；页脚 `#env-info` 来自 `GET /health`。不调模型的条加 `callsModel: false`，主按钮不因缺 Key 而 disabled。各条 README 写该条页面清单。禁止小节 CLI。

```bash
cd apps
yarn install
yarn app:00-01-mini-app-step-1     # 例：模块 00 mini-app 跑通
```

脚本名必须是 `app:{模块两位}-{小节两位}-{英文短名}-step-{N}`，新建可运行 Demo 时写进 `package.json`（[AGENTS.md §5.2](../AGENTS.md#52-小节-demo) + [agents/05-demo.md §5.3.14](agents/05-demo.md#5314-demo-子节拆分动态引导由浅入深新)）；代码落在 `apps/{模块文件夹}/{小节文件夹}-step-{N}/`（**扁平结构**：`-step-N` 直接拼到小节文件夹名后缀，多个 step 是同模块下的兄弟文件夹；`{N}` 起步为 `1`，动态追加）。**无例外**——模块 00 mini-app 也走这套（`app:00-01-mini-app-step-1` → `00-环境准备/01-mini-app-step-1/`）。

模块文件夹名与 `docs/学习模块/` 下的文件夹同名；小节文件夹名与该条小节 MD 文件名去掉 `.md` 相同。
