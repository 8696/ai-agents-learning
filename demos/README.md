# 小节 Demo

这里放**某一条外部小节**的最小可运行样例，不是五个项目，也不是第 6 个 app。

| | 五个项目 `apps/` | 这里 |
| - | ---------------- | ---- |
| 干什么 | 按条增量回填的作品；模块最后一行是验收收口 | 只验证当前这一条知识点 |
| 彼此 | 五个 app 互不 import | 条与条不互相 import，也不 import `apps/*` |

Key 仍只读 `apps/.env`。Demo 判断见 [AGENTS.md §5.2](../AGENTS.md#52-小节-demo与五个项目分离)；正式项目按条增量回填见 [§5.3](../AGENTS.md#53-五个项目按条增量回填本地产出是收口)。不要把这里的 Demo 复制进 `apps/` 当交付。

**学到该条、判断为「可运行」才建对应文件夹。** 不要提前建空目录。

当前已有（模块 00 / 01 回头补）：

| 跑 | 对应小节 |
| -- | -------- |
| `yarn demo:00-api-key-billing` | 输入 / 输出 Token 分开 |
| `yarn demo:01-token` | 中英文 Token 数（不调 API） |
| `yarn demo:01-temperature` | 同一 prompt，温度 0 vs 1.2 |
| `yarn demo:02-streaming-sse` | SSE 帧长什么样 + 流式 vs 一次性 TTFT 对照（不调 API） |

```bash
cd demos
yarn install
yarn demo:00-api-key-billing   # 例
```

脚本名必须是 `demo:{模块两位}-{英文短名}`，新建可运行 Demo 时写进 `package.json`（[AGENTS.md §5.2](../AGENTS.md#52-小节-demo与五个项目分离)）。

模块文件夹名与 `docs/学习模块/` 下的文件夹同名；小节文件夹名与该条小节 MD 文件名去掉 `.md` 相同。
