# **API Key / 计费**：按 Token 计费，输入 / 输出分开；订阅 Key ≠ 按量 API Key

> 对应模块：[模块 00 · 环境准备](./README.md) · 小节进度第 1 条
> 本条在「一小节一文件」改版前已勾 ✅。按当时模块级笔记、ChatGPT Mini 跑通记录和对话补全到 9 节模板；不扩写成没聊过的教材。

- **来源**：本对话（陪跑 Coach）；无外部 URL
- **状态**：已沉淀

### 是什么

调云端模型，账单按 **Token** 算，不是按「发了几条消息」。一次请求通常拆成两截：

| 字段 | 含义 | 谁在花 |
|------|------|--------|
| `prompt_tokens` | 你送进去的（system / user / 历史） | 输入单价 |
| `completion_tokens` | 模型吐出来的 | 输出单价（通常更贵） |
| `total_tokens` | 上面两段相加 | 这次请求的计费单位 |

**两把 Key 不是同一把：**

- **网页订阅 Key**（ChatGPT Plus、Token Plan 一类）：给网页产品用的套餐凭证。
- **按量 API Key**（控制台里的「接口密钥」）：给代码调 API 用，按 Token 扣费。

同一家供应商可能同时发这两种。复制错了，鉴权失败，不是 SDK 写错。本仓库模块 00 用的是 MiniMax **按量 API Key**，走国内站控制台。

### 为什么（Agent 开发要懂）

Agent 从第一天就要盯用量。后面多轮对话、Tool 往返、RAG 把检索结果塞进 prompt，输入会暴涨；模型一边想一边写，输出通常比输入贵。不知道去哪看账单，后面会突然烧钱还查不到是哪一次请求。

ChatGPT Mini 流结束后打印 `usage`，就是为了把「这次花了多少」钉在终端上，对不上再去 [MiniMax 控制台](https://platform.minimaxi.com) 查账号花费。

### 易混点

| 容易当成 | 其实是 |
|----------|--------|
| 网页 ChatGPT 会员 Key | 控制台里的按量 API Key。会员能聊天 ≠ 代码能调 API。 |
| Token Plan 订阅 Key | 按量接口密钥。混用会 401/鉴权失败，不是 `baseURL` 写错。 |
| 「发一条消息 = 收一次固定费」 | 按这条消息里的 Token 数算；同样一句话，中文通常比英文更贵（Token 本身 → [模块 01 · Token](../01-AI与LLM基础认知/02-Token.md)）。 |
| 国内站 / 海外站同一把环境 | 国内默认 `api.minimaxi.com`，海外是 `*.minimax.io`。域名错了会连错环境或直接失败。 |

### 例子

跑 `yarn dev "你好"`，终端最后会出现类似：

```text
prompt_tokens: …    ← 你送进去的
completion_tokens: … ← 模型吐出来的
total_tokens: …
```

对不上就去 MiniMax 控制台账单页，不要拿自己心里估的「大概几个字」去对账。流式最后一包不一定带 `usage`（看厂商支不支持 `stream_options.include_usage`）；没有数字时，控制台才是准的。

### 我追问过的

- 问了：默认用中国区、现在用 MiniMax、后面还有 GLM → 答在「取舍」：模块 00 只接 MiniMax 按量 Key；智谱放到模块 02。中国区控制台 / API / 账单走国内站，不要写成海外 `*.minimax.io`。
- 问了：配置放到公共地方，但不要抽共享包 → 答在「取舍」和 [密钥安全](./03-密钥安全.md)：Key 集中在 `apps/.env`，代码仍在各 app 里。

### 取舍

- **先盯一家的用量，不在第一周比三家价格。** 模块 00 只验证链路通不通（能发、能流、能看到 usage）。账号可以三家都注册 ≠ 代码要三家都接上。
- 对账：以 API 回传的 `usage` 和控制台账单为准。本地自己数 Token 是后面模块的事（估算 / 截断），不能当账单。

### 踩坑

- 错：把 Token Plan 订阅 Key 填进 `MINIMAX_API_KEY` → 鉴权失败。对：按量计费用「接口密钥」。
- 错：Base URL 写成 `api.minimax.io` → 连海外站或直接失败。对：国内 `https://api.minimaxi.com/v1`。
- 错：Key 写进代码再推公开仓库 → 几分钟内被扫走、额度被刷。对：只放 `apps/.env`，泄露先 rotate（见 [密钥安全](./03-密钥安全.md)）。

### 过关自检

- 云端模型按 Token 计费，输入（`prompt_tokens`）和输出（`completion_tokens`）分开算，输出通常更贵。
- 网页订阅 Key 和按量 API Key 不是同一把，混用会鉴权失败，不是代码写错。
- 用量看请求里的 `usage`；对不上或流里没带 usage，去控制台看账单。

### 还没搞懂的

本条没有未闭合问题。Token 本身是什么、中文为什么更贵 → 已在 [模块 01 · Token](../01-AI与LLM基础认知/02-Token.md) 补上。
