# 清空与重置

仅在**你明确要清进度 / 重学**时用本文。日常陪跑（`coach start` 等）不要读、不要执行这里的步骤。

对助手：用户没点名「清空 / 重置 / 重学」时，**禁止**因打开本文件或 README 里的链接就动手清。清完**不要**自动 `coach start` 开讲，等学习者说 start。

当前架构（对照根 [README.md](README.md) / [AGENTS.md](AGENTS.md)）：`docs/` 管笔记与进度；`apps/` 是**一份共享 package** + **按条小节文件夹**。清 Demo **只删小节夹**，不动共享层。

---

## 对助手说什么

复制发给 Cursor / Claude Code / Codex：

```text
全部清空重学：清沉淀 + 清 Demo。按仓库根 RESET.md 做，清完用 coach status 确认回到模块 00 第一条。
```

也可只清一半：`清空沉淀` / `清空 Demo`。只重学某一模块：`只重学模块 XX（清该模块沉淀 + 该模块 Demo）`。

---

## 清什么

| 清什么 | 清掉什么 | 清完之后 |
| ------ | -------- | -------- |
| **沉淀** | 已写的小节 MD / `{NN}-模块复盘.md`、小节进度 ✅、「我的链接」、总览「完成」、根 README 进度快照 | 笔记回到「未学」空壳；路线 / 验收原文 / 「搜什么」不动 |
| **Demo** | `apps/{模块}/` 下各小节可运行样例 + `package.json` 里对应 `app:*` + [apps/README.md](apps/README.md) 占用表行 | 共享 package 还在；学到再按 [AGENTS.md §5.2](AGENTS.md#52-小节-demo) 建夹、加脚本、加占用行 |
| **全部** | 上面两项 | 从模块 00 第一条重新走 |

**不要动：**

- `docs/00–07` 总纲正文（怎么用 / 路线 / 题库 / 术语）。**例外**：[`docs/06-学习总览.md`](docs/06-学习总览.md) 的「完成」格 + 已变成具体 Demo 链接的「代码落点」格（见下）
- [AGENTS.md](AGENTS.md) · [CLAUDE.md](CLAUDE.md) · `agents/`
- 各模块 README 里的验收条文、「搜什么 / 去哪学」、「本条要能讲清」、动手落点里「学完要做出什么」
- `apps/` **共享层**（一份 package，不是每条一份）：

```text
apps/README.md · package.json · yarn.lock · tsconfig.json · tsconfig.base.json
apps/load-root-env.ts · llm.ts · .env.example · .nvmrc · node_modules/
```

本机 `apps/.env` 默认保留 Key。要连 Key 一起清：删 `apps/.env`，再从 `apps/.env.example` 复制。

清完说 `coach status`，应报到：**模块 00 · 外部学习 · 第一条（API Key / 计费）**。若还停在已勾过的条目上，说明没清干净。

只清 Demo、进度仍 ✅：会出现「勾过但文件夹没了」。已 ✅ 不回头补（除非点名）。要重学请清沉淀或全部。

---

## 助手执行清单

### 沉淀

1. **外部条 MD**（`docs/学习模块/{模块}/{两位}-{短名}.md`，不含复盘）：标题与「对应模块」行保留（重点原文含加粗）；正文收成未学空壳。对照下方模板，不要拿已沉淀篇当样子。
2. **复盘 MD**（`{NN}-模块复盘.md`）：收成 [agents/07-review.md](agents/07-review.md) 的 24 份统一空壳（模块 00 旧复盘若格式不同，一并改回该模板）。
3. 各模块 `README.md` **小节进度**：状态全改 `⬜`；外部条「我的链接」改回 `—`；复盘行只留指向本条 `{NN}-模块复盘.md` 的链接（去掉已落 Demo / apps README 链接）。
4. 各模块 README **验收**里的 `- [x]` 改回 `- [ ]`。若文首「代码落点」或「动手产出」写成了「已落 apps/…」，改回约定路径 +「学到该条、§5.2 判为可运行才建」；**不要改**验收条目原文和「要做出什么」列表。
5. [`docs/06-学习总览.md`](docs/06-学习总览.md)：模块「完成」全改 `⬜`；00–03 等已写成具体 Demo 链接的「代码落点」改回约定路径（与 05 行以后同形，例如 `` `apps/02-LLM-API开发/{小节文件夹}/` ``）。本页**没有**单独的「当前节奏」字段——节奏由各模块 README 第一个 ⬜ 决定。
6. 根 [README.md](README.md)「学习总览」快照表：全部改回 ⬜ / 未开始（目录树可留作「会建什么」示意）。

只重学某一模块：只改该模块文件夹 + 总览对应行 + 根 README 快照里该行。

#### 外部条空壳（保留标题与对应模块行）

```markdown
# **{复制进度表「重点」原文，含加粗}**

> 对应模块：[模块 NN · 名称](./README.md) · 小节进度第 N 条
> 本条尚未沉淀。学完后由 Coach 按下方模板把**本对话已讲过的**全部写入；你只减不加，不补没聊过的。

- **来源**：—
- **状态**：未学
- **Demo**：未判

> 各节写什么、怎么判断归哪一节、达标要求：见仓库根 [AGENTS.md §7.2](../../../AGENTS.md#72-沉淀--小节进度对齐)。

### 是什么

（学完后填）

### 为什么（Agent 开发要懂）

（学完后填）

### 易混点

（学完后填）

### 例子

（学完后填）

### 我追问过的

（学完后填）

### 取舍

（学完后填）

### 踩坑

（学完后填）

### 过关自检

（学完后填）

### 还没搞懂的

（学完后填）
```

复盘空壳直接抄 [agents/07-review.md](agents/07-review.md)「`{NN}-模块复盘.md` 模板」；**不要**写 `Demo：未判`（复盘不打 Demo 判断）。

现成对照（未学篇，勿改它们）：外部 [`docs/学习模块/05-Tool-Calling/02-Tool-Description.md`](docs/学习模块/05-Tool-Calling/02-Tool-Description.md)；复盘 [`docs/学习模块/23-Production-Agent-Architecture/07-模块复盘.md`](docs/学习模块/23-Production-Agent-Architecture/07-模块复盘.md)。外部对照篇若还没有 `Demo：未判`，重置时**补上**。

### Demo

`apps/` 是一份共享 package（[AGENTS.md §5.1](AGENTS.md#51-apps-子文件夹结构)）。**禁止**再跑旧命令 `find apps -mindepth 1 -maxdepth 1 ! -name README.md ! -name .env -exec rm -rf {} +`——那会把 `package.json` / `llm.ts` / `load-root-env.ts` / tsconfig / `.nvmrc` 一并删掉。

```bash
# 仓库根。只删模块文件夹，保留共享层与 node_modules
find apps -mindepth 1 -maxdepth 1 -type d ! -name node_modules -exec rm -rf {} +
```

然后：

1. `apps/package.json`：`scripts` **只留** `typecheck`，删掉全部 `app:*`。依赖按 [§5.0](AGENTS.md#50-代码落点规范node--ts--注释--key--选型) 起步集留着（`tsx` `dotenv` `zod` `openai` `typescript` `@types/node` + koa 栈 + `@anthropic-ai/sdk`）。小节专属依赖（如 `gpt-tokenizer`）卸掉；拿不准就留，不影响重学。
2. [apps/README.md](apps/README.md)：约定段落、Key / CATALOG、端口公式保留。「当前已有」占用表清空，只留表头 + 一句「尚无已落 Demo。学到该条、§5.2 判为可运行再加行。」不要提前建空模块夹。
3. 可选：`node scripts/gen-manifest.js`（导航清单若还指着已删路径）。

下次某条外部判为可运行：按条建 `apps/{模块}/{小节}/`，在 `package.json` 加 `app:{模块两位}-{小节两位}-{英文短名}`，占用表加一行。写法对照 [agents/05-demo.md](agents/05-demo.md)，禁止拿已删的旧夹当模板抄。

只重学某一模块：只删 `apps/{该模块文件夹}/`，只去掉该模块的 `app:*` 与占用表行。

### 清完核对

```text
coach status 应报：
  当前模块：00 环境准备
  节奏：外部学习
  当前条目：API Key / 计费
  代码落点：apps/00-环境准备/01-API-Key-计费（尚未建）
  动作：外部（可 Demo）
```

- 各模块 README 没有残留 ✅ / 🔄
- 总览「完成」全 ⬜
- `apps/` 根下没有 `00-`…`23-` 模块夹；`llm.ts` / `load-root-env.ts` / `package.json` 还在
- `package.json` 的 `scripts` 没有 `app:`
- 打开任意已清过的小节 MD：`状态：未学`；外部条另有 `Demo：未判`
