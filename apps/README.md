# 小节 Demo + 模块 00 Mini App

`apps/` 是本仓库**唯一的代码落点**——所有外部小节的最小可运行样例 + 模块 00 的代码落点 + 每模块一行的**模块小 APP**（本地产出，[AGENTS.md §5.4](../AGENTS.md#54-模块小-app本地产出行)）。

模块 00 的代码落在 `00-环境准备/01-mini-app/`（兼其本地产出）；其余模块按条 Demo 落到各自小节；模块小 APP 落到 `{NN}-本地产出/`（**不 import** 其它小节）。

| | 这里 `apps/` |
| - | ------------- |
| 干什么 | 单条知识点验证 + 模块 00 最小闭环 + 每模块一个小 APP（串本模块已学能力） |
| 彼此 | 子文件夹互不 import（模块小 APP 也不 import 按条 Demo） |
| Key | 只读 `apps/.env`：顶层 `LLM_PROVIDER` + `LLM_MODEL`，各家 Key/Base URL 按提供商分组。Demo 用 `apps/llm.ts` 的 `getLlm()`，不要在小节里写死供应商。 |

**学到该条、判断为「可运行」才建对应文件夹。** 不要提前建空目录。

**本表是已落地 Demo 的唯一清单**（脚本名 / 端口）。新建对照 [AGENTS.md §5](../AGENTS.md#5-demo-落点) 的骨架，不要把本表某条当模板去抄。改端口时改这里和 `package.json`，不要抄进 `AGENTS.md`。

当前已有：

| 跑 | 默认端口 | 对应小节 |
| -- | -------- | -------- |
| `yarn app:00-01-mini-cli-a` | — | 模块 00 mini-app · CLI 协议 A |
| `yarn app:00-01-mini-cli-b` | — | 模块 00 mini-app · CLI 协议 B |
| `yarn app:00-01-mini-server` | `50000` | 模块 00 mini-app · HTTP + SSE |
| `yarn app:00-01-api-key-billing` | `50001` | 输入 / 输出 Token 分开 |
| `yarn app:01-02-token` | — | 中英文 Token 数（不调 API） |
| `yarn app:01-06-embedding` | — | 玩具向量：Token ID 减不出远近，余弦能排出谁近（不调 API） |
| `yarn app:01-07-temperature` | `50107` | 同一 prompt，温度 0 vs 1.2 |
| `yarn app:01-11-cognition-lab` | `50111` | 模块 01 本地产出：豆谷上新台（贴原料 → 一张上新卡） |
| `yarn app:02-01-streaming-sse` | `50201` | SSE 帧长什么样 + 流式 vs 一次性 TTFT 对照 |
| `yarn app:02-02-protocol-ab` | `50202` | MiniMax-M3 同 Key 跑协议 A vs B |
| `yarn app:02-03-adapter` | `50213` | 适配层：业务只调 sendMessage（同小节第二份 HTTP Demo） |
| `yarn app:02-03-abort-controller` | `50203` | AbortController 三端点对照 |
| `yarn app:02-04-rate-limit` | `50204` | 429 / Rate Limit 五场景时间线 |
| `yarn app:02-05-thinking` | `50205` | 思考 vs 正文流式拆分 + 双协议追问 |
| `yarn app:02-06-api-lab` | `50206` | 模块 02 本地产出：豆谷值班台（流式草稿 + 协议 B 终审） |
| `yarn app:03-01-system-user-assistant-priority` | `50301` | System / User / Assistant 优先级 + 多轮 |
| `yarn app:03-02-few-shot-zero-shot` | `50302` | 同一评价任务：Zero-shot vs Few-shot |
| `yarn app:03-04-prompt-versioning-diff` | `50304` | 一字之差：v1.0.0 vs v1.1.0 看行为影响 |
| `yarn app:03-05-prompt-lab` | `50305` | 模块 03 本地产出：豆谷客服中台（来信工单 / 纪要 / 制度问答） |
| `yarn app:03-05-local-products` | — | 同目录 CLI 回归（40 次调用，可选；过关看 HTTP） |

HTTP 端口公式见 [AGENTS.md §5.3.3](../AGENTS.md#533-目录与脚本)：`5{模块两位}{小节两位}`。不要把 `PORT` 写进共享 `apps/.env`。

```bash
cd apps
yarn install
yarn app:00-01-mini-cli-a          # 例：模块 00 mini-app 跑通
```

脚本名必须是 `app:{模块两位}-{小节两位}-{英文短名}`，新建可运行 Demo 时写进 `package.json`（[AGENTS.md §5.2](../AGENTS.md#52-小节-demo)）。

模块文件夹名与 `docs/学习模块/` 下的文件夹同名；小节文件夹名与该条小节 MD 文件名去掉 `.md` 相同。
