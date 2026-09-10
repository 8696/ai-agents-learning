/**
 * 模块 07 · 01 · Agent Loop / ReAct · step-3 失败 Observe 后继续 · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/* → runAgentLoop → 真 LLM（协议 A）。
 *
 * 教学锚点（step-3 「变体 G 失败 Observe 后继续」）：
 *   - 复制 step-2 全量代码（已经会 Promise.all 并行 Act）
 *   - query 改成「把 todo-999 标完成」（故意触发 handler 返回 `{ok:false, error:"not_found"}`）
 *   - 期望看到：第 1 圈 complete_todo(id="todo-999") → handler 返回失败 → 错误进 messages → 下一圈模型改参
 *     （list_todos 找真 id 或换正确 id）→ 成功 → 最终答案
 *   - 关键点：handler **throw 会让 Loop 死**；handler 返回结构化错误（`{ok:false,...}`）才让 Loop 自纠
 *   - 这是「Act 不死 = Observe 进 messages = 下一圈 Reason 能看见」的完整闭环
 *
 * 浏览器：
 *   GET  /              → public/index.html
 *   GET  /health        → { ok, port, provider, model, hasKey, callsModel:true }
 *   POST /api/agent-run → { query } → runAgentLoop → 返回 trajectory + 失败观察卡片
 *
 * 日志（§5.3.16）：server.start 由本地 logger 写文件 + console；业务代码每个可打日志的点都在 lib/ 与 routes/ 里。
 *
 * 入口：cd apps && yarn app:07-01-agent-loop-react-step-3
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountAgentRoutes } from "./routes/agent.js";
import { mountErrorDemoRoutes } from "./routes/error-demo.js";
import { mountTodosRoutes } from "./routes/todos.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑，三行不能换位置）──
app.use(bodyParser());

mountHealthRoutes(router);
mountAgentRoutes(router);
mountTodosRoutes(router);
mountErrorDemoRoutes(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；step-3 教学点：失败 Observe 进 messages 后下一圈改参（变体 G 闭环）", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
