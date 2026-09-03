# 03 · 01 · System / User / Assistant 优先级 Demo

§5.3 全栈版 · §5.3.8 **按职责分层** · §5.3.13 **协议 A vs B 对照例外** · 一个进程、一个端口。

## 端口

**50301**。可临时 `PORT=50999 yarn app:03-01-system-user-assistant-priority` 覆盖。浏览器打开 `http://127.0.0.1:50301/`。

## 怎么跑

```bash
cd apps
yarn app:03-01-system-user-assistant-priority
# → http://127.0.0.1:50301/                          总览
# → http://127.0.0.1:50301/pages/priority.html       Case 1 优先级
# → http://127.0.0.1:50301/pages/with-history.html   Case 2 有历史
# → http://127.0.0.1:50301/pages/no-history.html     Case 3 无历史
```

yarn 入口只有这一条。需要 `apps/.env` 里当前 `LLM_PROVIDER` 对应的 Key（同一把 Key 走协议 A 与协议 B）。

## 数据流

```text
场景页
  → POST /api/case1-priority | /api/case2-with-history | /api/case3-no-history
  → routes/*（薄：闸门 → 分叉 send）
       ├ lib/protocol-a/send-once.ts   只 openai；system 进 messages[]
       └ lib/protocol-b/send-once.ts   只 Anthropic；system 走顶层
  → lib/flow/judge.ts（协议无关：SYSTEM_WIN / USER_WIN / REMEMBERED / FORGOT）
  → JSON { caseName, system, user, turns, a, b }
```

## 当前能做什么

| Case | 看什么 | 期望判定 |
| ---- | ------ | -------- |
| 1 优先级 | System JSON-only vs User 长文段 | `SYSTEM_WIN`（妥协则 `PARTIAL` / `USER_WIN`） |
| 2 有历史 | 3 轮 user/assistant/user | 提到「北京」→ `REMEMBERED` |
| 3 无历史 | 2 轮 user/user，漏 assistant | `FORGOT` 或 `PARTIAL` |

协议 A 的思考块嵌在 `content` 字符串里，页面灰显；剥掉之后才看得出真实 JSON。协议 B 顶层 `system` 在结构化约束上更干净。Case 3 协议 B 常会自信地编造天气 —— 幻觉样本。

## 文件结构

```
01-System-User-Assistant-优先级/
├── server.ts                 # 只装配
├── routes/                   # health + 三个 case（分叉在这里）
├── lib/
│   ├── http/                 # runtime-ctx / request-guards / write-upstream-error
│   ├── protocol-a/           # 只 openai
│   ├── protocol-b/           # 只 anthropic
│   └── flow/                 # 固定文案 + 判定 + 组装 CaseResponse
├── README.md
└── public/
    ├── index.html            # 总览
    ├── pages/                # priority / with-history / no-history
    ├── components/           # layout · side-cards
    └── utils/                # api-client / wait-demo-ui
```

只 import `apps/llm.ts`。不 import 其它小节。

## 接口

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/health` | ok / port / provider / model / modelB / hasKey |
| POST | `/api/case1-priority` | 优先级对照 |
| POST | `/api/case2-with-history` | 多轮 WITH assistant |
| POST | `/api/case3-no-history` | 多轮 WITHOUT assistant |

无 Key 时页脚 `Key ❌`，场景页主按钮 disabled。

## 对应学习沉淀

[docs/学习模块/03-Prompt-Engineering/01-System-User-Assistant-优先级.md](../../../docs/学习模块/03-Prompt-Engineering/01-System-User-Assistant-优先级.md)
