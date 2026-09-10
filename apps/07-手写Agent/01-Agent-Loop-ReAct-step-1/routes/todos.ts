/**
 * 职责：GET /api/todos —— 返回当前内存里的全部 todo（教学：让前端肉眼看见「Loop 在改什么」）。
 *
 * 数据流：无入参 → ctx.body = { count, todos, snapshotAt }。
 *
 * 不调模型，不参与 Loop；纯只读。
 * step-1 的「事实」就是内存里这份常量数组（详见 lib/tools/todo-data.ts 的 STORE）。
 *
 * 教学锚点（step-1 增强）：
 *   - 页面加载时 fetch 一次 → 列出当前 12 条 todo（含 dueDate / tag / done）
 *   - 跑 Agent 后，/api/agent-run 返回里额外带 todosBefore / todosAfter / diff
 *     → 前端把「跑之前」「跑之后」「diff」三栏并排，让「变体 D 串行依赖 + 变体 G/J 完成后」
 *       这条主线用「数据真的变了」肉眼看出来。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { snapshotTodos } from "../lib/tools/todo-data.js";

export function mountTodosRoutes(router: Router): void {
  router.get("/api/todos", (ctx: Context) => {
    const todos = snapshotTodos();
    ctx.body = {
      count: todos.length,
      todos,
      snapshotAt: new Date().toISOString(),
    };
  });
}
