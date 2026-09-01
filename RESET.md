# 清空与重置

仅在**你明确要清进度 / 重学**时用本文。日常陪跑（`coach start` 等）不要读、不要执行这里的步骤。

对助手：用户没点名「清空 / 重置 / 重学」时，**禁止**因打开本文件或 README 里的链接就动手清。

---

## 对助手说什么

复制发给 Cursor / Claude Code / Codex：

```text
全部清空重学：清沉淀 + 清 Demo。按仓库根 RESET.md 做，清完用 coach status 确认回到模块 00 第一条。
```

也可只清一半：`清空沉淀` / `清空 Demo`。

---

## 清什么

| 清什么 | 清掉什么 | 清完之后 |
| ------ | -------- | -------- |
| **沉淀** | 已写的小节 MD、小节进度 ✅、「我的链接」、学习总览勾选 | 笔记回到「未学」空壳；路线 / 验收原文不动 |
| **Demo** | `apps/` 下各小节可运行样例（保留 `apps/README.md` 约定 + `apps/.env` 里的 Key） | 共享 package 与各条文件夹删掉；学到再按 §5.2 建 |
| **全部** | 上面两项 | 从模块 00 第一条重新走 |

**不要动：** `docs/00–07` 总纲、`AGENTS.md`、各模块 README 里的验收与「搜什么」、`apps/.nvmrc` · `.env.example` · `tsconfig.base.json`、`apps/README.md`（约定）。本机 `apps/.env` 一般保留 Key。

清完说 `coach status`，应报到：**模块 00 · 外部 · 第一条**。若还停在已勾过的条目上，说明没清干净。

---

## 助手执行清单

### 沉淀

1. 每个已学过的小节 MD（`docs/学习模块/**/{两位序号}-*.md`）：标题与模块链接保留；正文收成「未学」空壳（对照 [`docs/学习模块/02-LLM-API开发/01-Streaming-SSE.md`](docs/学习模块/02-LLM-API开发/01-Streaming-SSE.md)）：`状态：未学`，`Demo：未判`，九节（本地产出多「这一课…」「代码运行流程」）写回 `（学完后填）`。
2. 各模块 `README.md` **小节进度**：状态全改 `⬜`，「我的链接」改回 `—`。
3. 各模块 README **验收**里的 `- [x]` 改回 `- [ ]`。
4. [`docs/06-学习总览.md`](docs/06-学习总览.md)：模块「外部 / 本地」改回 `⬜`；顶部「当前节奏」改成模块 00 第一条。

只重学某一模块时：只改该模块文件夹 + 总览对应行。

### Demo

```bash
# 仓库根。保留 apps/README.md + apps/.env（Key），删掉共享 package 与各小节文件夹
find apps -mindepth 1 -maxdepth 1 ! -name README.md ! -name .env -exec rm -rf {} +
```

下次某条外部判断要可运行 Demo 时再按 [`AGENTS.md`](AGENTS.md) §5.2 建。

要连 Key 一起清：删 `apps/.env`，再从 `apps/.env.example` 复制。
