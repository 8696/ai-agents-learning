# 清空与重置

仅在**你明确要清进度 / 重学**时用本文。日常陪跑（`coach start` 等）不要读、不要执行这里的步骤。

对助手：用户没点名「清空 / 重置 / 重学」时，**禁止**因打开本文件或 README 里的链接就动手清。清完**不要**自动 `coach start` 开讲，等学习者说 start。

当前架构（对照根 [README.md](README.md) / [AGENTS.md](AGENTS.md)）：`docs/` 管笔记与进度；`apps/` 是**一份共享 package** + **按条小节文件夹**（`-step-N` 后缀扁平结构，模块 00 也走这套）。清 Demo **只删小节文件夹**，不动共享层与 `node_modules`。

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
| **沉淀** | 已写的小节 MD / `{NN}-模块复盘.md`、小节进度 ✅、「我的链接」、模块 README 验收 `- [x]` | 笔记回到「未学」空壳；路线 / 验收原文 / 「搜什么」不动 |
| **Demo** | `apps/{模块}/` 下各小节 `*-step-N` 可运行样例 + `package.json` 里对应 `app:*` + [apps/README.md](apps/README.md) 占用表行 | 共享 package 还在；学到再按 [AGENTS.md §5.2](AGENTS.md#52-小节-demo) 建夹、加脚本、加占用行 |
| **全部** | 上面两项 | 从模块 00 第一条重新走 |

**不要动：**

- `docs/00–07` 总纲正文（怎么用 / 路线 / 题库 / 术语）。
- [AGENTS.md](AGENTS.md) · [CLAUDE.md](CLAUDE.md) · `agents/`。
- 各模块 README 里的验收条文、「搜什么 / 去哪学」、「本条要能讲清」、动手落点里「学完要做出什么」。
- `apps/` **共享层**（一份 package，不是每条一份）：

  ```text
  apps/README.md · package.json · yarn.lock
  apps/tsconfig.json · tsconfig.base.json
  apps/llm.ts · load-root-env.ts · logger.ts
  apps/.env.example · .nvmrc · .env · node_modules/
  ```

  本机 `apps/.env` 默认保留 Key。要连 Key 一起清：删 `apps/.env`，再从 `apps/.env.example` 复制。

- 仓库根 `scripts/`（`check-demo.cjs` / `gen-manifest.js` / `start-all-demo.js` / `static-server.js`）—— 不在 `apps/` 下，不动。
- 根 [README.md](README.md) 目录树（是「会建什么」示意，无进度字段）。
- [docs/06-学习总览.md](docs/06-学习总览.md)（纯导航页，无「完成」格、无「代码落点」格）。

清完说 `coach status`，应报到：**模块 00 · 外部学习 · 第一条（API Key / 计费）**。若还停在已勾过的条目上，说明没清干净。

只清 Demo、进度仍 ✅：会出现「勾过但文件夹没了」。已 ✅ 不回头补（除非点名）。要重学请清沉淀或全部。

---

## 助手执行清单

### 沉淀

1. **外部条 MD**（`docs/学习模块/{模块}/{两位}-{短名}.md`，不含复盘）：标题与「对应模块」行保留（重点原文含加粗）；正文收成未学空壳。对照下方「外部条空壳」模板。
2. **复盘 MD**（`{NN}-模块复盘.md`）：收成 [agents/07-review.md](agents/07-review.md) 的 24 份统一空壳（见下方「复盘空壳」）。
3. 各模块 `README.md` **小节进度**：状态全改 `⬜`；外部条「我的链接」改回 `—`；复盘行只留指向本条 `{NN}-模块复盘.md` 的链接（去掉已落 Demo / apps README 链接）。
4. 各模块 README **验收**里的 `- [x]` 改回 `- [ ]`。若文首「代码落点」或「动手产出」写成了「已落 apps/…」，改回约定路径 +「学到该条、§5.2 判为可运行才建」；**不要改**验收条目原文和「要做出什么」列表。
5. 根 [README.md](README.md) 无进度字段，不动；[docs/06-学习总览.md](docs/06-学习总览.md) 已是纯导航页，不动。

只重学某一模块：只改该模块文件夹。

#### 外部条空壳（保留标题与对应模块行）

外部条 MD 实际写多少节、节名叫什么，按本条知识走——[AGENTS.md §7.2](AGENTS.md#72-沉淀--小节进度对齐) **不要求套死模板**，教材四节（是什么 / 为什么 / 易混 / 例子）必写，其余节按本条**实际有**的内容增删。下方是**最小可工作空壳**（向后兼容旧九节；写盘时可按本条知识裁剪）：

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

复盘行不写 `Demo：未判`（复盘不打 Demo 判断）。

现成对照（未学篇，勿改它们）：外部 [docs/学习模块/05-Tool-Calling/02-Tool-Description.md](docs/学习模块/05-Tool-Calling/02-Tool-Description.md)；复盘 [docs/学习模块/23-Production-Agent-Architecture/07-模块复盘.md](docs/学习模块/23-Production-Agent-Architecture/07-模块复盘.md)。外部对照篇若还没有 `Demo：未判`，重置时**补上**。

#### 复盘空壳（24 份统一）

直接抄 [agents/07-review.md](agents/07-review.md)「`{NN}-模块复盘.md` 模板」段：

```markdown
# **模块复盘**

> 对应模块：[模块 NN · 名称](./README.md) · 最后一条（**不写代码**，只回顾收口）
> 本条尚未沉淀。学完后由 Coach 把**本对话已讲过的**写入；你只减不加。

- **来源**：—
- **状态**：未学

> 本节写什么、达标要求：见仓库根 [AGENTS.md §7.3](../../../AGENTS.md#73-模块复盘进度表最后一行)。

### 一句话讲完这个模块

（对着不懂的人说：这个模块解决什么问题。说不出来就是没学完）

### 这些条怎么连成一条线

（外部条之间的关系：谁是谁的前提、哪两条其实是一个硬币的两面、哪条是另一条的兜底。
 按条 MD 各自看不到这一层，这是复盘的主要产出）

### 模块验收对答

（把本模块 README「验收」逐条抄进左列，右列用自己的话答一遍。有一条答不出就不准勾 ✅）

| 验收项 | 我的回答 |
| ------ | -------- |

### 最容易记错的三条

（跨条易混）

### 落过的 Demo 各自证明了什么

（本模块 `apps/` 下已落的按条 Demo，一行一个。**不新写代码**，这是代码地图。本模块无代码则写「本模块无代码」）

| Demo / 入口 | 跑它当时看清了什么 |
| ----------- | ------------------ |

### 踩过的坑（跨条）

### 还没搞懂的 → 去哪解决

（每条必须指向后面某个模块编号，或写「自己查」。模块不许带着糊涂进下一模块）
```

### Demo

`apps/` 是**一份共享 package**（[AGENTS.md §5.1](AGENTS.md#51-apps-子文件夹结构)）。所有小节 Demo 落到 `apps/{模块文件夹}/{小节文件夹名}-step-{N}/`（**扁平结构**：`-step-N` 直接拼到小节文件夹名后缀，多 step 是同模块下的兄弟文件夹；`{N}` 起步为 `1`，动态追加）。模块 00 也走这套（如 `00-环境准备/01-API-Key-计费-step-1/`）。

```bash
# 仓库根。只删 apps/ 根下的子目录，保留共享层文件与 node_modules。
# 用 -type d ! -name node_modules 比「！文件名」安全 —— 只删目录，不会误删 .env / .env.example / .nvmrc。
find apps -mindepth 1 -maxdepth 1 -type d ! -name node_modules -exec rm -rf {} +
```

**禁止**再跑旧命令：

```bash
# 错：会把 apps/{模块}/{小节}-step-N/ 删光，连共享层 README.md / package.json / .env.example / llm.ts / logger.ts / tsconfig.* 都被吞
find apps -mindepth 1 -maxdepth 1 ! -name README.md ! -name .env -exec rm -rf {} +
```

然后：

1. `apps/package.json`：
   - `scripts` **只留** 仓库根 `scripts/` 下的工具脚本入口（`typecheck` / `check-demo` / `gen-manifest` / `static-serve` / `start-all-demo`），删掉全部 `app:*`。
   - `dependencies` 起步集（[AGENTS.md §5.0](AGENTS.md#50-代码落点规范node--ts--注释--key--选型)）：`tsx` `dotenv` `zod` `openai` `@anthropic-ai/sdk` `typescript` `@types/node` + koa 栈（`koa` `@koa/bodyparser` `@koa/router` `koa-static` `@types/koa` `@types/koa-static` `@types/koa__router`）。
   - **小节专属依赖卸掉**：模块 06 才用的 `better-sqlite3` `@types/better-sqlite3` `gpt-tokenizer`、`@babel/parser`（manifest 生成）等。拿不准就留，不影响重学。
2. [apps/README.md](apps/README.md)：约定段落、Key / CATALOG、端口公式 + 「新建 / 改口 5 步 checklist」保留。「当前已有」占用表清空，只留表头 + 一句「尚无已落 Demo。学到该条、§5.2 判为可运行再加行。」不要提前建空模块夹。
3. 可选：仓库根 `node scripts/gen-manifest.js`（导航清单若还指着已删路径）。

下次某条外部判为可运行：按条建 `apps/{模块文件夹}/{小节文件夹名}-step-{N}/`（[§5.3.14 动态引导](agents/05-demo.md#5314-demo-子节拆分动态引导由浅入深新)，**扁平结构**），在 `package.json` 加 `app:{模块两位}-{小节两位}-{英文短名}-step-{N}`，占用表加一行。写法对照 [agents/05-demo.md](agents/05-demo.md)，禁止拿已删的旧夹当模板抄。

只重学某一模块：只删 `apps/{该模块文件夹}/`，只去掉该模块的 `app:*` 与占用表行。

### 清完核对

```text
coach status 应报：
  当前模块：00 环境准备
  节奏：外部学习
  当前条目：API Key / 计费
  代码落点：apps/00-环境准备/01-API-Key-计费-step-1（尚未建）
  动作：外部（可 Demo）
```

- 各模块 README 没有残留 ✅ / 🔄
- [docs/06-学习总览.md](docs/06-学习总览.md) 无变化（纯导航页，本轮不动）
- `apps/` 根下没有 `00-`…`23-` 模块夹；`llm.ts` / `load-root-env.ts` / `logger.ts` / `package.json` / `tsconfig.json` / `tsconfig.base.json` / `.env.example` / `.nvmrc` 还在
- `package.json` 的 `scripts` 没有 `app:`；deps 已清回起步集
- 打开任意已清过的小节 MD：文首 `状态：未学`；外部条另有 `Demo：未判`
- 复盘 MD：文首 `状态：未学`，七节都是占位
