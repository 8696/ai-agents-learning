# 05 · 01 · Function Calling 协议 Demo

§5.3 全栈版 · §5.3.8 **按职责分层** · 协议 A · 一个进程、一个端口。

## 端口

**50501**。可临时 `PORT=50999 yarn app:05-01-function-calling-protocol` 覆盖。

## 浏览器访问

```bash
cd apps
yarn app:05-01-function-calling-protocol
# → http://127.0.0.1:50501/                     总览（Registry）
# → http://127.0.0.1:50501/pages/run.html       ① 单 tool / ② 并行
# → http://127.0.0.1:50501/pages/serial.html    ③ 串行数据依赖
# → http://127.0.0.1:50501/pages/realistic.html ⑥ 差旅助手（4-5 轮混合业务流）
# → http://127.0.0.1:50501/pages/zod-error.html ④ Zod repair
# → http://127.0.0.1:50501/pages/tool-error.html ⑤ 工具执行失败
```

yarn 入口只有这一条。

## 数据流

```text
场景页 (public/pages)
  → utils/api-client.js
  → POST /api/run | /api/run-serial | /api/simulate-zod-error
  → routes/*（薄）
  → lib/flow/*（主流程小函数）
  → lib/tools/*（Registry + Tool 定义）
  → tool_result 回灌 → 再调模型 → stop
```

## 文件结构（按职责，不按行数硬切）

```
01-Function-Calling-协议/
├── server.ts                 # 只装配
├── routes/                   # 薄：入参闸门 → 调 flow → ctx.body
├── lib/
│   ├── http/                 # runtime-ctx / request-guards / write-upstream-error
│   ├── tools/                # registry / tool-defs / tool-types
│   ├── schema/               # zod-to-json-schema
│   └── flow/                 # parse→execute→loop→simulate-zod-repair
├── README.md
└── public/
    ├── index.html            # 总览
    ├── pages/                # 场景页（语义名）
    ├── components/           # 共享 JSX：layout（导航/状态/说明区/页脚环境条）· rounds · tools-panel
    └── utils/                # 无 JSX：api-client / wait-demo-ui
```

只 import `apps/llm.ts`（顶层提供商配置）。不 import 其它小节的任何代码。

## 接口

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/health` | 环境 + tool 名 |
| GET | `/tools` | Registry 全貌 |
| POST | `/api/run` | 单 / 并行 / 工具失败（max 4 轮） |
| POST | `/api/run-serial` | 串行，最多 5 轮 |
| POST | `/api/run-realistic` | 差旅助手 4-5 轮混合（并行+串行），用 trip_* 5 个工具 |
| POST | `/api/simulate-zod-error` | 篡改 arguments → Zod repair |

## §5.3.2 六项

各场景页各自齐：happy path、错误 ≥2 类、loading（`#status-pill` + 按钮 disabled）、`#output` 输出区、页脚 `#env-info`（provider / model 由 `GET /health` 填）、`#page-intro` 教学说明。总览页的 happy path = Registry 加载。

无 Key 时页脚显示 `Key ❌`，各页主按钮直接 disabled，不用等 503。

## 入口脚本

`app:05-01-function-calling-protocol` → `tsx 05-Tool-Calling/01-Function-Calling-协议/server.ts`

## 概念

[docs/学习模块/05-Tool-Calling/01-Function-Calling-协议.md](../../../docs/学习模块/05-Tool-Calling/01-Function-Calling-协议.md)
