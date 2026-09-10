# 04 · 踩坑沉淀（自更新）

**Why**：本仓库写死规定不写 Claude 记忆（`memory/`），但 Agent 在 Cursor / Claude Code / Codex 间反复踩同一类坑（端口撞、日志截断、logger 委托、路径写错…）。把坑版本化进仓库，跨 Agent 共享，比本地记忆可靠。
**How to apply**：任何 Agent 在做以下动作**前**，先 grep 本文件 §3「坑索引」对一遍：落 / 改 Demo、跑命令、写日志、改 `AGENTS.md` / `agents/`、跑 `check-demo`、处理端口冲突、git 操作。**踩坑当场追加**（§2 协议），不积压、不写记忆。

---

## 1. 字段约定（每条坑固定 6 字段）

```text
### P-NNN  ·  短标题（≤20 字）

- **症状**：用户 / Agent 看到的现象（一句话，可贴错误原文）
- **触发**：什么命令 / 文件 / 时机下出现（精确到行号 / commit / 命令）
- **根因**：为什么会踩（一句话，不讲修复）
- **修复**：具体改什么（命令 / 文件 / 行号，可复制）
- **反模式**：禁止这么写 / 这么跑（一条命令级禁令）
- **关联**：小节 ID / commit SHA / PR / §5.x 协议编号
```

字段顺序固定，便于 grep。缺字段 = 不算条目，Agent 写到草稿区也不许合入 §3。

---

## 2. 自更新协议（踩坑当场写 + 用户定期 review）

**谁写**：任意 Agent（Claude Code / Cursor / Codex 同流程）。

**何时写**：

1. **踩坑当场**：报错 / 失败 / 行为不符合预期时，先看 §3 索引有没有这条。**有 → 按修复走，不重写**；**没有 → 当场追加**（不允许"等会儿补"）。
2. **预防性命中**：本文件 §3 已存在、当前任务**正要触发**它时，**先写一行「正在触发 P-NNN」**到对话（不写文件），按修复走完，**事后不补条目**（预防不是新坑）。
3. **疑似坑但证据不足**：写进 §4「草稿」，不进 §3。

**写哪里**：

- **有明确 §3 条目** → 不动文件，按修复走
- **新坑、证据足** → 追加到 §3，编号顺延 `P-NNN`
- **疑似坑、证据不足** → 追加到 §4「草稿」段，等用户 review

**写多长**：症状 + 触发 + 根因各 1 句；修复可多行（贴命令 / 代码）；反模式 1 句命令级禁令；关联给指针。

**何时不写**：

- 用户口头问「这正常吗」、Agent 已当场解释完、不是新坑 → 不写
- 与学习内容本身相关的疑问（概念混淆 / 需求不清）→ 走 [agents/06-teach.md](agents/06-teach.md)，不写本文件
- 与代码 bug 相关的修复（功能错了）→ 走 commit message，不写本文件（除非是 Agent 流程性 bug）

**用户 review 节奏**：

- 默认**每周一次**（用户主动 `coach pitfall review` 或自定节奏）
- review 时把 §4「草稿」逐条判定：合入 §3 / 删除 / 合并已有条目
- §3 条目**不主动删**，只标记 `（2026-XX-XX 已不再触发 · 原因）`，用户确认后归档到 §5「归档」

---

## 3. 坑索引（编号顺延，不重不漏）

<!-- Agent 追加新条目时，从下一编号开始；不允许插队 / 复用编号 -->
<!-- 草稿不在此处，§4 -->

### P-001  ·  logger 顶层模板被 Demo 委托使用

- **症状**：`check-demo` 报「委托：`apps/{demo}/lib/logger.ts` 里 `import` 路径指向 `../../apps/logger.ts`」
- **触发**：落新 Demo 时直接 `cp apps/logger.ts apps/{demo}/lib/logger.ts` 但忘了改内部 `import`
- **根因**：顶层 `apps/logger.ts` 用相对路径 `../../logs`；Demo 拷到 `apps/{demo}/lib/` 后相对路径变成 `../../apps/logs`，错的
- **修复**：落 Demo 当下**完整拷** `apps/logger.ts` 到 `apps/{demo}/lib/logger.ts`，**重写** `path.resolve(__dirname, "..", "logs")`（即 `apps/{demo}/logs/`），**禁止**用 `new URL("./logs/", import.meta.url)`（会落 `lib/logs/`）
- **反模式**：`import { logger } from "../../apps/logger"` / `from "../../../logger"`
- **关联**：AGENTS.md §5.6、agents/05-demo.md §5.3.16

### P-002  ·  `data.入参` / `data.返回值` 用 Len/Count/Preview 冒充全文

- **症状**：`check-demo` 报「缺多行 data / 入参截断」
- **触发**：写 `data: { 入参长度: msgs.length, 前 200 字: msgs[0].content.slice(0,200) }`
- **根因**：logger 顶层模板已禁 `MAX_BYTES` / `…truncated`；缩略 = 截断 = 不算「原样完整」
- **修复**：直接 `data: { 入参: msgs }`；对象 / 数组原样写，logger 不截就不截
- **反模式**：`入参预览` / `入参长度` / `入参前 N 字` / `…已截断`
- **关联**：AGENTS.md §5.6、2026-09-09 强制

### P-003  ·  Demo 端口撞学习者默认 50038

- **症状**：`EADDRINUSE :::50038` / 烟雾测试日志写到别处
- **触发**：用 `yarn app:xx` / `preview_start` 跑新 Demo 烟雾测试
- **根因**：`yarn app:xx` 默认绑学习者端口；`preview_start` 走 .claude/launch.json 不是当前 Demo server
- **修复**：`cd apps && PORT={本 Demo 端口，从 50000 起 max+1} npx tsx {demo}/server.ts` + `sleep 4` + `ls -lh apps/{demo}/logs/$(date +%Y-%m-%d).log`
- **反模式**：`yarn app:{demo}` 跑烟雾测试 / 用 `preview_start` 验端口 / `curl` / `mtime` / `grep` 多余验证
- **关联**：AGENTS.md §5.5、agents/05-demo.md §5.3.3

### P-004  ·  端口基线 50000 未四处同步

- **症状**：Demo 起服务成功但前端连不上 / 端口被回收
- **触发**：落新 Demo 时只改了 `server.ts` 里的 `PORT`，没改 `package.json` / `apps/README.md` / `.claude/launch.json`
- **根因**：AGENTS.md §5.5 强制「一处端口、四处同步」（server.ts + package.json scripts + apps/README.md + .claude/launch.json）
- **修复**：`grep -rn "{端口}" apps/{demo}/` + `apps/README.md` + `.claude/launch.json`，逐处对齐
- **反模式**：`PORT` 进共享 `.env`（学习者会撞）/ 端口 ≤ 10000（撞系统）
- **关联**：AGENTS.md §5.5

### P-005  ·  Node 升级后 better-sqlite3 旧 prebuild ABI 不兼容

- **症状**：跑含 better-sqlite3 的 Demo 时 `Error: The module '.../better-sqlite3/build/Release/better_sqlite3.node' ... NODE_MODULE_VERSION X. This version of Node.js requires...`（NODE_MODULE_VERSION 数字 < 当前 Node 期望值）
- **触发**：`cd apps && yarn app:06-01-...` 或 `PORT=xxxx npx tsx 06-.../server.ts` 第一次跑 better-sqlite3 模块；常见于 `nvm use v22/v24` 切换或重装 Node 后
- **根因**：`apps/node_modules/better-sqlite3/build/Release/better_sqlite3.node` 是装包时缓存的旧 Node ABI prebuild（二进制 `mtime` 远早于当前 Node 安装日）；Node 升版后 ABI 编号变了，旧 `.node` 加载直接失败
- **修复**：`cd apps && npm rebuild better-sqlite3`（让 node-gyp 按当前 Node ABI 重编 `.node`，原地覆盖旧 prebuild；其它原生模块 prebuild 不动）
- **反模式**：`rm -rf apps/node_modules && yarn install` 全量重装（清掉所有原生模块 prebuild，全得重编，慢且容易再翻车）；只删 `apps/node_modules/better-sqlite3/build` 单目录（可能漏掉 `.deps` / `obj.target`）；不切回旧 Node 逃避
- **关联**：任何 better-sqlite3 / 原生模块依赖的 Demo；模块 06 `01-Context-vs-Memory-step-2`（首次引入 better-sqlite3）；`yarn` 装包时 Node 跨大版本升级后必踩

### P-006  ·  又写出黑话 / 口令句

- **症状**：对话、MD、或 Demo 日志 `explain` / 注释里出现「听起来重要、读完却对不上简单意思」的压缩说法（如「为什么打」「三拍」「五件套」「出门包」「这一刀」「闸门」「落盘」「合上笔记」「出网」「真活」）
- **触发**：为了短、为了像协议口令、或从旧笔记 / 旧 Demo 习惯性抄词
- **根因**：把陪跑口令当成教材用语；读者要先翻译才能懂
- **修复**：当场改成白话（为什么写这条日志 / 三个阶段 / 五条日志 / 提问清单 / 这一步 / 过关检查 / 写进文件 / 真发网络请求 / 真正干活的那一层）；对照根 [AGENTS.md 白话强制](../AGENTS.md)。新落 Demo 的 `explain` 禁止再写「为什么打：」
- **反模式**：明知是黑话仍「先写着、以后再改」；新造更短的黑话替换旧黑话；整词替换后不检查页面按钮文案是否被误伤（如「只打一次」被改成「只写一次」）
- **关联**：AGENTS.md 白话强制（2026-09-10）；本对话黑话清理（含 apps/ 日志 explain）

---

## 4. 草稿（疑似坑 · 证据不足 · 等用户 review）

<!-- Agent 写这里时，必须标 ① ② ③ 触发证据 + 缺失证据，方便用户 review -->

（暂无）

---

## 5. 归档（已不再触发 · 留底可查）

<!-- 格式：### P-NNN  ·  短标题（2026-XX-XX 已不再触发 · 原因） -->

（暂无）

---

## 6. 维护节奏

- **写入**：任意 Agent，踩坑当场
- **合稿 / 删草稿**：用户 review 时处理
- **归档**：用户确认某条不再触发后，从 §3 移 §5
- **禁止**：Agent 自行删 §3 / 自行改 §1 §2 协议 / 跨条目合并（除非用户明确指令）
