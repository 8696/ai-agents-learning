# Demo · Temperature / Top-P（§5.3 React + koa）

对应：[模块 01 · Temperature / Top-P](../../../docs/学习模块/01-AI与LLM基础认知/07-Temperature-Top-P-step-1.md)

本条必须看见：同一句 prompt，**T=0 两次几乎一样**、**T=1.2 更易分叉**、**T=0.7 中等**——三档并排。Top-P 另开一页，一次只动一个旋钮。

## 端口

**50004**。可临时 `PORT=50999 yarn app:01-07-temperature-step-1` 覆盖。

## 浏览器访问

```bash
cd apps
yarn app:01-07-temperature-step-1
# → http://127.0.0.1:50004/                         总览
# → http://127.0.0.1:50004/pages/temperature.html   温度三档
# → http://127.0.0.1:50004/pages/top-p.html         Top-P 三档（可把 T 改成 0 验证反例）
# → http://127.0.0.1:50004/pages/repeat.html        同一档连跑 N 次
```

## 数据流

```text
场景页
  → POST /api/sweep/temperature | /api/sweep/top-p | /api/repeat
  → routes/*（薄）
  → lib/flow/run-sweep.ts / run-repeat.ts
  → lib/flow/run-group.ts（判定 STABLE / DIVERGED / PARTIAL / FAILED）
  → lib/sampling/call-once.ts（剥思考标记后再比对）
```

## 文件结构

```
07-Temperature-Top-P/
├── server.ts
├── routes/  lib/{http,sampling,flow}/
└── public/{index.html, pages/, components/, utils/}
```

只 import `apps/llm.ts`。档位来自 `lib/sampling/presets.ts`，经 `GET /health` 下发，页面不写死。

## 接口

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/health` | provider / model / hasKey / ladders / defaults |
| POST | `/api/sweep/temperature` | 扫 T=0 / 0.7 / 1.2，top_p 固定 1 |
| POST | `/api/sweep/top-p` | 扫 top_p=1 / 0.9 / 0.3 |
| POST | `/api/repeat` | 固定一组参数连跑 N 次 |

## §5.3.2 六项

各场景页齐。无 Key 时主按钮 disabled。空 prompt → HTTP 400；fetch 失败 → 红横幅。

## 对应学习沉淀

[docs/学习模块/01-AI与LLM基础认知/07-Temperature-Top-P-step-1.md](../../../docs/学习模块/01-AI与LLM基础认知/07-Temperature-Top-P-step-1.md)
