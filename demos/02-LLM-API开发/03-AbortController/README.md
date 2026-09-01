# Demo · AbortController · 客户端停 ≠ 服务端停

对应小节：[docs/学习模块/02-LLM-API开发/03-AbortController.md](../../../docs/学习模块/02-LLM-API开发/03-AbortController.md)

## 怎么跑

```bash
cd demos
yarn install      # 第一次或新加依赖时
yarn demo:02-03-abort-controller
```

打开浏览器 `http://127.0.0.1:5175/`，页面有三个按钮（端口由 `demos/02-LLM-API开发/03-AbortController/index.ts` 默认 5175；可用 `PORT=5180 yarn demo:02-03-abort-controller` 改）。

## 看什么

| 按钮 | 端点 | 演示什么 | 看哪里 |
| --- | --- | --- | --- |
| ① 流到底 | `POST /api/full` | **对照基线**：不取消，跑到底 | 帧数 / 耗时 / usage |
| ② 收 N 帧就停 | `POST /api/cancel-after-frames` | **客户端停**：服务端到 N 帧 abort；浏览器层 abort 也会走这里 | 帧数（明显少于①）/ "🛑 已 abort" 状态 |
| ③ 故意不传 signal | `POST /api/no-signal-abort` | **signal 没传会怎样**：5s 后 res.end()，但 SDK 不知情继续跑 | 帧数 / 后端"SKD 跑完"日志 / "usage 仍按 generated 计费"提示 |

**对照结论**：
- ① vs ②：cancel 帧数 < full 帧数 → 服务端确实停了（OpenAI 流式关 socket 后通常停继续扣费）
- ② vs ③：传 signal 能省 token + 能中止；不传 signal 服务端继续跑 = 钱继续扣

## 后端日志关键行

```
[/api/full]                  : ✅ 完成 | 帧数 N | usage M tokens
[/api/cancel-after-frames]  : 已收 K 帧 → controller.abort()  ← 服务端 abort
[/api/cancel-after-frames]  : 🛑 AbortError caught | 帧数 K | usage 未拿到（流提前结束）
[/api/no-signal-abort]      : 5s 到 → 强制 res.end()（**没传 signal，SDK 继续跑**）
[/api/no-signal-abort]      : SDK 跑完 | 共 N 帧 | usage M tokens  ← 即使客户端断了，token 仍算
[/api/no-signal-abort]      : ⚠️ 即使客户端 res.end()，SDK 已生成的 token 都计入 usage，钱照算
```

## 概念 / 取舍 / 踩坑

在 [03-AbortController.md](../../../docs/学习模块/02-LLM-API开发/03-AbortController.md)。