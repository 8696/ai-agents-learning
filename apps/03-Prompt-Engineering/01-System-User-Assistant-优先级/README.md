# Demo · System / User / Assistant 优先级 + 多轮 · 协议 A vs B（§5.3 React + koa 完整版）

对应小节：[docs/学习模块/03-Prompt-Engineering/01-System-User-Assistant-优先级.md](../../../docs/学习模块/03-Prompt-Engineering/01-System-User-Assistant-优先级.md)

**端口**：`50301` · 浏览器打开 `http://127.0.0.1:50301/`（由 `PORT` 环境变量覆盖）。

## 怎么跑

```bash
cd apps
yarn install                                                # 第一次或新加依赖时
yarn app:03-01-system-user-assistant-priority              # tsx server.ts → koa + HTML 内联 React
```

启动后做两件事：

1. **后端**：5 端点（`GET /` 静态页、`GET /health`、`POST /api/case1-priority` / `/api/case2-with-history` / `/api/case3-no-history`）。
2. **浏览器页面**：打开 `http://127.0.0.1:50301/` → 3 个 Case 区块 + 全局汇总带，按钮点 "Run · 协议 A + B" 触发端点。

按 Ctrl+C 退出。

> 需要 `apps/.env` 里有 `MINIMAX_API_KEY`（同 Key 走协议 A 与协议 B 两个 baseURL）。
> 预估成本：每次 Run 一个 Case 跑 2 次 API（协议 A + 协议 B），整页 3 个 Case 跑完 ≈ 6 次调用 × 短 prompt ≈ 0.02~0.05 元。

## 技术栈（§5.3 完整版）

- **后端**：koa + @koa/router + koa-static + @koa/bodyparser + OpenAI SDK + Anthropic SDK + zod
- **前端**：HTML 内联 JSX 块（`public/index.html` 内 `<script type="text/babel">`）+ Tailwind 4 browser CDN + React 18.3.1 UMD + Babel Standalone 7.26.4
- **不引**：esbuild / vite / 任何打包器；htm / preact / 任何 React 替代品；`<script type="module">` / importmap
- **入口层省略**（§5.3.3）：直接 `tsx server.ts`，无 `index.ts`

## 数据流

```text
浏览器 GET /
  └─ 静态 public/index.html（Tailwind + React UMD + Babel Standalone CDN + 内联 JSX）
  └─ Babel 转译 JSX → React.createElement → ReactDOM.createRoot(#root).render(<App />)

浏览器 POST /api/case1-priority
  └─ koa router → runCase1()
  └─ Promise.allSettled([协议 A, 协议 B])
       └─ runProtocolA(system, turns) → aClient.chat.completions.create
       └─ runProtocolB(system, turns) → bClient.messages.create
  └─ 本地判定（JSON.parse 严格 / 长度 / 关键字）
  └─ JSON { caseName, system, user, turns, a: {...}, b: {...} }

浏览器 POST /api/case2-with-history    → 同上，turns 是 3 轮 user/assistant/user
浏览器 POST /api/case3-no-history      → 同上，turns 是 2 轮 user/user（中间缺 assistant）
```

## 页面有什么

| Case | system | user / turns | 期望 |
|------|--------|--------------|------|
| 1 · 优先级 | `"只能用 JSON {...}，禁止解释"` | `"用 ≥80 字详细说明理由"` | 模型听 System → 输出 JSON → `SYSTEM_WIN` |
| 2 · 多轮 WITH 历史 | (无) | `[user:我住北京] → [assistant:已记录] → [user:刚才那个城市天气?]` | 模型记得 → 提到「北京」 → `REMEMBERED` |
| 3 · 多轮 WITHOUT 历史 | (无) | `[user:我住北京] → [user:刚才那个城市天气?]`  ← 缺中间 assistant | 模型瞎猜 / 反问 / 编造 → `FORGOT` 或 `PARTIAL` |

每组 Case 内部 `Promise.allSettled` 并发起跑协议 A 和协议 B（用同一把 Key、不同 baseURL），学习者直接对照两边的输出与判定标签（绿/红/黄 pill）。

协议 A 的 `…` 标签在页面里**灰显**（`italic text-gray-500`） —— 学习者一眼能看到「A 的 content 字符串嵌了 thinking，strict JSON 不再 strict」。

## 当前能做什么

- 肉眼对比协议 A 与协议 B 的 system 字段位置（A: `messages[]`；B: 顶层 `system`）。
- 肉眼对比 usage 命名（A: `prompt/completion_tokens`；B: `input/output_tokens`）。
- 亲眼看到 System > User 的优先级是**事实**（不是厂商开关），以及「assistant 历史不塞回去 = 失忆 / 幻觉」的具体表现。
- Case 3 协议 B 通常会出现**模型自信地编造**的样本（28℃ / 北风 2-3 级 / AQI 65）—— 经典幻觉样本，跟模块 01「幻觉是怎么来的」直接对照。

## 对应学习沉淀

- 沉淀文档：[docs/学习模块/03-Prompt-Engineering/01-System-User-Assistant-优先级.md](../../../docs/学习模块/03-Prompt-Engineering/01-System-User-Assistant-优先级.md)
- 角色语义、优先级训练事实、易混点、踩坑详见该 MD。

## §5.3.4 强制骨架（实际渲染 id）

- `#page-header` · `#page-title` · `#status-pill`（顶部状态徽章）
- `#page-main` · `#controls` · `#output`（3 个 Case + 全局汇总带）
- `#page-footer`（端口 / 协议 / 模型信息）

## 文件结构

```
apps/03-Prompt-Engineering/01-System-User-Assistant-优先级/
├── server.ts         ← koa + 5 端点 + 业务（runCase1/2/3 + judgeCase1/2/3 + runProtocolA/B + VERDICT_LABEL）
├── README.md         ← 本文件
└── public/
    └── index.html    ← Tailwind + React 18 UMD + Babel Standalone + 内联 JSX（3 个 CaseBlock + StatusPill + SummaryRow）
```
