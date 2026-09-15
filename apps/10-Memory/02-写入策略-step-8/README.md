# 写入策略 · 第八步（冲突与更新 · 第 5 关完整版）

对应学习笔记：[docs/学习模块/10-Memory/02-写入策略.md](../../docs/学习模块/10-Memory/02-写入策略.md)

## 现在怎么跑

```bash
cd apps
yarn app:10-02-write-policy-step-8
```

浏览器打开：http://127.0.0.1:50111/

端口：`50111`（yarn 脚本 inline `PORT=50111`；`lib/http/runtime-ctx.ts` `.default(50111)` 兜底）

## 数据流

```text
用户访问总览 / 任一 sub-page（PageNav 跳转）
    → 总览 /                → 看四个 sub-mode 卡片 + 为什么本步不做「一键撤回」
    → 4-A sub-page (mode-actions):
        用户点四句话按钮 → POST /api/conflict/resolve
        → 调 resolveConflict(intent=...) → 决定 NEW / UPDATE / MERGE / DELETE / NOOP
        → 旧值按需塞 fact_history 表（UPDATE / MERGE / DELETE 时各写一行）
        → DELETE 走软删除（kv.deleted_at 设为当前时间）
        → 返回 { action, key, oldValue, newValue, recordedHistory, softDeleted } 给前端展示
    → 4-C sub-page (mode-merge):
        seed → 合并按钮 → POST /api/conflict/resolve intent=merge
        → 业务把 values 数组合并好传进来 → resolveConflict 走 MERGE 分支
        → 旧值进 fact_history (action='merge') → kvSet 写入新 value（含 values 数组）
    → 4-D sub-page (mode-soft-delete):
        seed → 软删除按钮 → POST /api/conflict/resolve intent=delete
        → kvSoftDelete 把 deleted_at 设为当前时间 → 旧值进 fact_history (action='delete')
        → 召回视图（GET /api/recall）= 默认 SQL deleted_at IS NULL → 列表为空
        → 已删除视图（GET /api/trash）= SQL deleted_at IS NOT NULL → 这条还在
        → 复活：intent=update + 同 value → kvSet 把 deleted_at 置 NULL → 召回又能看见
    → 4-E sub-page (mode-history):
        库里任一条事实 → GET /api/fact/:key/history → 列 fact_history（按 id 升序）
所有 sub-page 共享 lib/db.ts（继承 step-7 的 kv 表 + 加 deleted_at + 新增 fact_history）
+ 同一个端口（§5.3.14 例外 · 当前 step 加页面）
```

## 当前能做什么

| sub-page | 入口 | 演示什么 | 覆盖变体 |
| --- | --- | --- | --- |
| 总览 | `/` | 四个动作 + 三种旧值去向 + 为什么不做一键撤回 | — |
| mode-actions · 四个动作 | `/pages/conflict-actions.html` | 库里预置 Vue 3 + TypeScript,依次送「我改用 React 了」「我 Vue 和 React 都写」「我不用 React 了」「我们组用 Vue 3」,看见 UPDATE / MERGE / DELETE / NOOP 四个动作 | 变体 5-A + 四动作 |
| mode-merge · 合并多值 | `/pages/conflict-merge.html` | 单跑「我 Vue 和 React 都写」,value.values = ["Vue 3 + TypeScript", "React"] | 判定 · 合并 |
| mode-soft-delete · 软删除 | `/pages/conflict-soft-delete.html` | 「我不用 React 了」 → 软删除 + 旧值进历史;召回视图空,已删除视图还有;复活按钮把 deleted_at 置 NULL | 变体 5-C + 软删除 |
| mode-history · 历史版本 | `/pages/conflict-history.html` | 点开任一条事实看 fact_history（每次 action / 旧值 / 新值 / 时间） | 旧值去向 · 进历史 |

## 当前未做

- **变体 5-C 真删路径**：`lib/db.ts` 留了 `kvDel` 物理删除接口,本步页面没接——避免学习者误操作丢数据。
- **需求 8 · 审计与安全（投毒拦截 + 写入幂等 + 一键撤回）**:按笔记 §8 留到 step-9+ 另开 step 做完整 audit 表 + 撤回按钮;本步 fact_history 是「值变更」,不含操作人 / 撤回能力。
- **需求 6 · 过期完整版(6-A 永不过期 / 6-C 衰减 / 6-D 被新事实挤掉)**:留给 step-N+。
- **需求 7 · 压缩与摘要**:留给 step-N+。
- **需求 1 · 写入时机**:留给 step-N+。
- **变体 5「看明确程度」(模糊的不盖过确定的)**:本步 intent 由前端 / 用户表达,不调模型判「明确程度」;这层语义留给未来模型判意图时再补。

## 跑完看什么

页面启动时会在 `apps/10-Memory/02-写入策略-step-8/logs/{YYYY-MM-DD}.log` 写日志。烟雾测试:

```bash
cd apps
PORT=50111 npx tsx 10-Memory/02-写入策略-step-8/server.ts
# 起服务后另开终端:
sleep 4 && ls -lh apps/10-Memory/02-写入策略-step-8/logs/$(date +%Y-%m-%d).log
```
