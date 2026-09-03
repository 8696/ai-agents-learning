# Demo · 429 / Rate Limit（§5.3）

对应：[04-Rate-Limit](../../../docs/学习模块/02-LLM-API开发/04-Rate-Limit-step-1.md)

**端口 50204** · `yarn app:02-04-rate-limit-step-1`

浏览器：

```text
/                   总览
/pages/mock.html    五个 mock（不需要 Key）
/pages/real.html    真 API 单次 + burst（需要 Key）
```

retry 算法在 `lib/retry/`：分类、Retry-After、指数退避、jitter、双上限。

## 对应学习沉淀

[docs/学习模块/02-LLM-API开发/04-Rate-Limit-step-1.md](../../../docs/学习模块/02-LLM-API开发/04-Rate-Limit-step-1.md)
