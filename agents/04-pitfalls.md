# 04 · 踩坑沉淀（自更新）

**Why**：本仓库写死规定不写 Claude 记忆（`memory/`），但 Agent 在 Cursor / Claude Code / Codex 间反复踩同一类坑（端口撞、日志截断、logger 委托、路径写错…）。把坑版本化进仓库，跨 Agent 共享，比本地记忆可靠。
**How to apply**：任何 Agent 在做以下动作**前**，先 grep 本文件 §3「坑索引」对一遍：落 / 改 Demo、跑命令、写日志、改 `AGENTS.md` / `agents/`、跑 `check-demo`、跑 `yarn typecheck`、处理端口冲突、git 操作。**踩坑当场追加**（§2 协议），不积压、不写记忆。

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

### P-007  ·  把多步交互压成一个按钮

- **症状**：沉淀 MD 写了「先出计划再确认」「第 2 步依赖第 1 步」「对照两侧」，页面却只有一个「开始」按钮，点一次服务端全跑完，前端只展示最终 JSON
- **触发**：落 / 改 Demo 时图快，用「最简闭环 / 一个端点一个按钮」覆盖本步教学点其实是多步的场景（模块 06 对照、模块 07 计划预览最常见）
- **根因**：把 §5.3.14「step-1 能多小就多小」误读成「任何 step 都可以压成一次点击」；没对照需求清单的验收步骤
- **修复**：落代码前先数 MD 里的人机步骤；几步就做几步请求 / 几个中间态。先预览再确认 = GET 只要计划 + POST 才执行；对照 = 每侧自己的 fetch
- **反模式**：`POST /api/compare` 一次返回「计划 + 已执行结果」却号称实现了「确认前无副作用」；一个按钮跑完 4 组轨迹
- **关联**：AGENTS.md §5.7、agents/05-demo.md §5.3.8、过关检查 2 第 8 项、过关检查 3「交互步骤」

### P-008  ·  对照塞进一个超级路由 / 单页堆满

- **症状**：`routes/compare.ts` / `public/index.html` 四五百行甚至七百行；一个 handler 里跑 2～4 条轨迹；Agent 改一行容易改错、补丁慢
- **触发**：把「页面并排对照」理解成「一个 `/api/compare` 打包」；把多个变体用 tab / 一堆按钮堆进同一页；复制上一个 step 继续往同一个文件加功能
- **根因**：旧 §5.3.8「同一场景切面不拆」被当成对照借口；没有行数硬上限，check-demo 只拦 `server.ts`
- **修复**：对照每一侧（每一组）一个 URL + `lib/flow/` 放共享逻辑；对照**可以同页并排**，但左栏 / 右栏 / 对照数字拆成组件。无关教学点才拆 `pages/`。单文件超 280/400/250 行先拆再改。复制旧 step 做 `step-(N+1)` 时，抄过来的超限文件必须先拆（豁免名单不跟到新文件夹）
- **反模式**：`Promise.all([runA(), runB(), runC(), runD()])` 放在一个 koa handler 里再 `ctx.body = { a, b, c, d }`；一个 route 文件挂 `/api/plan` 又挂 `/api/step-by-step`；单页 tab 切换变体 A–G；豁免名单里加新 step 的路径
- **关联**：AGENTS.md §5.7、agents/05-demo.md §5.3.8、scripts/check-demo.cjs 行数上限 + 一路由一文件

### P-009  ·  本步核心埋在路由里

- **症状**：打开 Demo 找不到 Agent 循环 / 调大模型写在哪；`routes/agent.ts` 或 `routes/compare.ts` 里塞着 while、规划器、`openai.chat.completions.create`；`lib/flow/` 没有一眼能认的主文件
- **触发**：落 Demo 时先写通一个胖 route，再「有空再拆」；或按行数上限切碎成一堆 8 行文件，主路径被拆断
- **根因**：没先判断「本步核心是什么」。本仓库是学大模型 / Agent 的，核心必须单独成文件，但不要拆太细
- **修复**：落代码前先写一句「本步核心：……」进 `lib/flow/{名字}.ts` 文件头；route 只校验入参、调用它、返回。相邻小帮手（parseArgs、剥 think 块）可以和核心同文件
- **反模式**：核心写在 `routes/*.ts`；一函数一文件把 while 拆成看不懂的碎片；对照拆成两个 HTML 却仍把调模型写在 route 里
- **关联**：AGENTS.md §5.7、agents/05-demo.md §5.3.8「落代码前先点名本步核心」、过关检查 2 第 10 项

### P-010  ·  验证完忘关服务（起服务做 verify，端口没释放）

- **症状**：Demo 跑完 / `check-demo` 过了之后端口仍被 `npx tsx` / `yarn app:xx` 进程占着；学习者回来开 `yarn app:...` 直接 `EADDRINUSE`；`lsof -i :{端口}` 能查到 ghost 进程；多个 Demo 之间互相撞口
- **触发**：落 / 改 Demo 后用 `preview_start` 或 `Bash ... &` 起服务做 verify（`node scripts/check-demo.cjs` 过 + 至少一次 snapshot 或 fetch），verify 完没调 `preview_stop` / `TaskStop` / `kill $PID`；用 Bash `yarn ... &` 绕开 `preview_*` 让服务脱离生命周期管控；用 `Ctrl+Z` 挂起当"关了"（端口仍占）
- **根因**：端口是仓库共享资源（占用表见 [apps/README.md](../apps/README.md)）；Agent 不替学习者持有长跑服务；服务起完不关 = 学习者下次回来必撞口 + Demo 一多互相影响
- **修复**：verify 完成（`check-demo` 过 + `cd apps && yarn typecheck` 过 + 至少一次 snapshot 或 fetch）后**立刻**收尾 —— `preview_stop` / `TaskStop` / `kill $SERVER_PID`。烟雾测试前必须先过 typecheck。烟雾测试三步固定：起服务（`cd apps && PORT=31001 npx tsx {demo}/server.ts > /tmp/srv.log 2>&1 &`）→ `sleep 4` + `ls -lh apps/{demo}/logs/$(date +%Y-%m-%d).log` 验路径 → **`kill $SERVER_PID`** 收尾。**不留长跑**。
- **反模式**：verify 完留着 server 不关 / 没事先启一遍"以防万一" / 用 Bash `yarn ... &` 绕开 `preview_*` / 多个 Demo 同进程抢口不报 / `Ctrl+Z` 挂起冒充关服务 / `yarn app:xx` 跑烟雾测试（占学习者默认口 50038）
- **关联**：AGENTS.md §5.5、§5.6；[agents/05-demo.md §5.3.15「验证服务生命周期（起完必须关）」](05-demo.md#5315-验证服务生命周期起完必须关)、[§5.3.16 烟雾测试](05-demo.md#5316-详细日志强制)

### P-011  ·  check-demo 把 /api/X/a 和 /api/X/b 收成一条

- **症状**：一个 `routes/*.ts` 里挂了 `/api/agent/with-gate`、`/api/agent/timeout-gate` 等多条静态路径，`node scripts/check-demo.cjs` 仍报「一路由 … → /api/agent」通过
- **触发**：落 Demo 时路由写成 `/api/{资源}/{变体}`（第三段是静态名字）；或以为 `health.ts` / `error-demo.ts` 不查就可以往里塞；Agent 以为 check-demo 过了就符合 §5.3.8
- **根因**：`routePathFamily` 把所有 `/api/X/...` 收成 `/api/X`，把「只把 `:id` 当同族」写过头了
- **修复**：`scripts/check-demo/limits.cjs` 的 `routePathFamily` 只剥 `/:[^/]+` 动态段；`/api/foo` 与 `/api/foo/:id` 同族，`/api/agent/a` 与 `/api/agent/b` 必须拆文件。改完跑 `node scripts/check-demo.cjs apps/07-手写Agent/03-死循环防护-step-3` 应失败。旧锁定文件才进 `ONE_URL_GRANDFATHER`
- **反模式**：为了让新 Demo 过关去扩豁免名单；把「同一业务」理解成「同一 `/api/X` 前缀就可以同文件」
- **关联**：agents/05-demo.md §5.3.8、scripts/check-demo/limits.cjs、P-008

### P-012  ·  Bash 第一条不 cd apps，npx tsx 找不到 demo

- **症状**：跑烟雾测试 `PORT=xxxx npx tsx {demo}/server.ts` 报 `ERR_MODULE_NOT_FOUND: Cannot find module '.../apps/{demo}/server.ts'`（cwd 在仓库根，npx 解析仓库根下的 `{demo}/server.ts`，路径少一段 `apps/`）；`yarn install` / `yarn check-demo` 同样报路径不存在
- **触发**：落 / 改 Demo 后写 Bash 跑 `npx tsx ...` / `yarn ...` / `node .../check-demo.cjs` 时，第一条命令没以 `cd .../apps` 开头；常见于「这条命令很短，应该不用 cd」的直觉
- **根因**：Bash cwd 每条命令都从仓库根重置（不持久）；`apps/` 是仓库子目录，仓库根跑 `npx tsx` 看不到 apps/ 下的文件。已有协议 [agents/05-demo.md §5.3.16](../agents/05-demo.md) 「Bash 命令第一条必须是 cd /.../apps」+ AGENTS.md §5.6 末尾「Bash 第一条必须 cd apps」，但 §3 没单独 P-NNN，Agent 不扫 §3 时容易忘
- **修复**：每条 Bash 第一条 token **必须是** `cd apps &&`（仓库根下操作，apps 是子目录）；后续 `&&` 串起来。兜底：`npx --prefix apps tsx apps/{demo}/server.ts`（从仓库根起的相对路径）。**禁止**用 cwd 推断「应该已经在 apps/ 下」——Bash 不持久
- **反模式**：`PORT=xxxx npx tsx {demo}/server.ts`（不 cd）；`yarn check-demo`（cwd 在仓库根，scripts/check-demo.cjs 找不到）；`git log` 顺手跑完不 cd 后面继续跑 npx；cd 后忘了 && 把后续命令接到同一行；用 `cd apps && npx ... &` 的后台进程脱离当前 shell 后 cwd 跑回根
- **关联**：AGENTS.md §5.6 末尾、agents/05-demo.md §5.3.16「Bash 命令第一条必须是 cd」、P-003 / P-010

### P-013  ·  agents/ 协议示例写死本机绝对路径

- **症状**：`agents/*.md` 里出现 `cd /Users/i2025/Desktop/ai-agents-learning/apps &&` 或 `npx --prefix /Users/i2025/...`；不同机器 clone 仓库路径不一样，协议示例在别人机器上跑不起来
- **触发**：落协议 / 改协议示例命令时直接照搬本机 cwd 路径；尤其 §5.3.16 烟雾测试示例（2026-09-10 模块 07 step5 拆 Demo 时发现 04-pitfalls.md P-012 + 05-demo.md §5.3.16 共 5 处写死）
- **根因**：协议要进仓库跟版本走，被所有 clone 者用；本机绝对路径 ≠ 仓库相对路径，不能写进共享规范
- **修复**：所有 Bash 示例用 `cd apps && ...`（cwd 假设仓库根）；绝对路径兜底改成 `npx --prefix apps tsx apps/{demo}/server.ts`
- **反模式**：`agents/*.md` 出现 `/Users/...`；`cd {绝对路径}/apps`；写示例前先 `echo $PWD` 拿本机路径再抄
- **关联**：P-012、04-pitfalls.md §1 字段约定、AGENTS.md 白话强制、2026-09-10 清理

### P-014  ·  MiniMax 嵌入误走 OpenAI input

- **症状**：建库 / 提问返回 `Cannot read properties of undefined (reading 'slice')`，hint 是「服务端未分类错误」；日志里 MiniMax 返回 `vectors: null`、`status_code: 2013`、`missing required parameter`（字段名 `texts`）
- **触发**：RAG Demo 用 `llm.openai.embeddings.create({ model, input })` 给 MiniMax `embo-01` 算向量
- **根因**：MiniMax 聊天能走协议 A，嵌入接口不能。它要 `texts` + `type: "db"|"query"`，返回 `vectors`，不是 OpenAI 的 `input` / `data[].embedding`
- **修复**：`provider === "minimax"` 时自己 `POST {baseUrlA}/embeddings`，建库 `type=db`、提问 `type=query`；解析 `vectors`；`base_resp.status_code !== 0` 时把 `status_msg` 做成 `HttpError`。禁止对 MiniMax 嵌入调用 `response.data.slice`
- **反模式**：`openai.embeddings.create({ input })` 打 MiniMax；建库和提问都传 `type=db`；返回值缺 `data` 仍 `.slice()`
- **关联**：模块 08 `01-RAG-流水线-step-1` `lib/embed/create-embeddings.ts`

### P-015  ·  智谱嵌入被 SDK 解成全 0

- **症状**：建库成功，查看库 `vector` 全是 0；提问分数全是 0 或乱序
- **触发**：RAG Demo `openai.embeddings.create({ model, input })` 打智谱 `embedding-3`（`openai@4.85` 没写 `encoding_format`）
- **根因**：SDK 默认要 base64，再按字节解成 Float32。智谱仍返回小数数组；2048 个小数被当成 2048 字节 → 512 维全 0
- **修复**：`embeddings.create` 显式 `encoding_format: "float"`；解析后拒绝全 0 向量，禁止写入
- **反模式**：对智谱嵌入依赖 SDK 默认编码；只拦空数组、把全 0 当成功
- **关联**：模块 08 `01-RAG-流水线-step-1` `lib/embed/create-embeddings.ts`；openai-node#1312

### P-016  ·  sendError 不要用 koa.Context

- **症状**：`cd apps && yarn typecheck` 报 `Property 'body' does not exist on type 'Request'`，以及 Router 的 ctx 不能传给 `sendError(ctx: Context)`
- **触发**：新 Demo 的 `lib/http/send-error.ts` 写 `import type { Context } from "koa"`，路由里读 `ctx.request.body`
- **根因**：`@koa/router` 自带另一份 `@types/koa`，和顶层 `@types/koa` 不是同一个 Context；bodyparser 的 `body` 也不在那份 Request 上
- **修复**：`sendError` 入参改成 `{ status: number; body: unknown }`；读请求体用 `jsonBody(ctx: { request: object })` 再断言 `body`，不要 import `koa.Context`
- **反模式**：`sendError(ctx: Context)`；为过编译在路由里写 `@ts-ignore`
- **关联**：模块 08 `01-RAG-流水线-step-1` `lib/http/send-error.ts`

### P-017  ·  写完 Demo 只跑 check-demo 忘 typecheck

- **症状**：`check-demo` 全过，学习者自己跑 `cd apps && yarn typecheck` 才爆 `tsc` 错误（如 `ctx.request.body` / 两套 `koa.Context`）
- **触发**：落 / 改可运行 Demo 后只跑 `node scripts/check-demo.cjs`，没跑 `yarn typecheck` 就告诉学习者写完了
- **根因**：check-demo 查目录 / 端口 / 日志 / 行数，不跑 TypeScript 编译器；两件事不是同一步
- **修复**：写完按顺序 ① check-demo ② `cd apps && yarn typecheck` ③ 烟雾测试。禁止把 typecheck 并进 `check-demo.cjs`
- **反模式**：`check-demo` 过就当写完；在 `scripts/check-demo.cjs` 里 `spawn tsc`；typecheck 不过仍起烟雾测试
- **关联**：agents/05-demo.md 写完后验收顺序、AGENTS.md §5.3、apps/package.json `typecheck`

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
