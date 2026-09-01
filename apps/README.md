# 小节 Demo + 模块 00 Mini App

`apps/` 是本仓库**唯一的代码落点**——所有外部小节的最小可运行样例 + 模块 00 的代码落点。

模块 00 的代码落在 `00-环境准备/01-mini-app/`；其余模块按 [AGENTS.md §5.2](../AGENTS.md#52-小节-demo) 落到各自小节。

| | 这里 `apps/` |
| - | ------------- |
| 干什么 | 单条知识点验证 + 模块 00 最小闭环 |
| 彼此 | 子文件夹互不 import |
| Key | 只读 `apps/.env` |

**学到该条、判断为「可运行」才建对应文件夹。** 不要提前建空目录。

当前已有：

| 跑 | 对应小节 |
| -- | -------- |
| `yarn app:00-01-mini-cli-a` | 模块 00 mini-app · CLI 协议 A |
| `yarn app:00-01-mini-cli-b` | 模块 00 mini-app · CLI 协议 B |
| `yarn app:00-01-mini-server` | 模块 00 mini-app · HTTP + SSE |
| `yarn app:00-01-api-key-billing` | 输入 / 输出 Token 分开 |
| `yarn app:01-02-token` | 中英文 Token 数（不调 API） |
| `yarn app:01-06-embedding` | 玩具向量：Token ID 减不出远近，余弦能排出谁近（不调 API） |
| `yarn app:01-07-temperature` | 同一 prompt，温度 0 vs 1.2 |
| `yarn app:02-01-streaming-sse` | SSE 帧长什么样 + 流式 vs 一次性 TTFT 对照（不调 API） |
| `yarn app:02-02-protocol-ab` | MiniMax-M3 同 Key 跑协议 A vs B（OpenAI / Anthropic 双端点流式 + 一次性 + thinking 4 组对照） |
| `yarn app:02-03-adapter` | 适配层示例（不调 API） |
| `yarn app:02-03-abort-controller` | AbortController 三端点对照：流到底 / 收 N 帧就停 / 故意不传 signal |
| `yarn app:02-04-rate-limit` | 429 / Rate Limit 五场景时间线：easy / chaos / auth / forever / ok（不调 API） |

```bash
cd apps
yarn install
yarn app:00-01-mini-cli-a          # 例：模块 00 mini-app 跑通
```

脚本名必须是 `app:{模块两位}-{小节两位}-{英文短名}`，新建可运行 Demo 时写进 `package.json`（[AGENTS.md §5.2](../AGENTS.md#52-小节-demo)）。

模块文件夹名与 `docs/学习模块/` 下的文件夹同名；小节文件夹名与该条小节 MD 文件名去掉 `.md` 相同。
