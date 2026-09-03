# Demo · AbortController（§5.3）

对应：[03-AbortController](../../../docs/学习模块/02-LLM-API开发/03-AbortController.md)

**端口 50203** · `yarn app:02-03-abort-controller`

```text
/                     总览
/pages/full.html      不取消，跑到底
/pages/cancel.html    带 signal，收 N 帧后停
/pages/no-signal.html 故意不传 signal
```

教学点：客户端停 ≠ 服务端停；abort 是关 socket；已生成 token 仍计费。

## 对应学习沉淀

[docs/学习模块/02-LLM-API开发/03-AbortController.md](../../../docs/学习模块/02-LLM-API开发/03-AbortController.md)
