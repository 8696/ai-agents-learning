# Demo · API Key / 计费

对应：[模块 00 · API Key / 计费](../../../docs/学习模块/00-环境准备/01-API-Key-计费.md)

本条必须看见的：一次请求里 `prompt_tokens`（输入）和 `completion_tokens`（输出）是分开的。订阅 Key ≠ 按量 Key 仍靠笔记和控制台，Demo 不覆盖。

```bash
cd apps
yarn install
yarn app:00-01-api-key-billing
```

需要已填 `apps/.env` 的 `MINIMAX_API_KEY`。这是模块 00 mini-app 的子 demo。
