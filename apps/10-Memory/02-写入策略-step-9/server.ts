/**
 * 职责：装配 HTTP 服务。只挂中间件和路由，不写业务。
 * 数据流：bodyParser → routes → 静态 public → listen 127.0.0.1:PORT。
 *
 * step-9 第 1 关「写入时机（Write Trigger / Memory Formation）」：三种触发方式
 *   - eager（每轮同步写）/ background（后台异步写）/ session-end（会话结束才写）
 *   同一段 text 在三种 mode 下的可观察差别（耗时 / 库条数变化 / 紧接 recall 是否召回得到 / 关闭窗口是否结算）。
 *   复用 step-7 的 lib/db.ts（通用 KV 抽象 + SQLite via better-sqlite3 + data/facts.db）；
 *   extract-facts 调真模型抽候选；trigger-write（本步核心 lib/flow/）按 mode 决定流水线何时跑。
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { logger } from "./lib/logger.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountFactsRoutes } from "./routes/facts.js";
import { mountRecallRoutes } from "./routes/recall.js";
import { mountChatRoutes } from "./routes/chat.js";
import { mountTriggerRoutes } from "./routes/trigger.js";
import { mountTriggerStatusRoutes } from "./routes/trigger-status.js";
import { mountConversationRoutes } from "./routes/conversation.js";
import { mountStatusRoutes } from "./routes/status.js";

const app = new Koa();
const router = new Router();

// 全局错误处理：route 内 throw（业务函数 / 拼 JSON 失败）→ 返回 JSON 而不是 koa 默认 HTML 错误页
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = (err as { status?: number })?.status ?? 500;
    logger.error(
      "server.error",
      "unhandled",
      `为什么写这条日志：route 内业务函数抛错，全局错误处理接住后转 JSON 返回。当前：捕获到未处理异常，status = ${status}。`,
      { 异常类型: err instanceof Error ? err.constructor.name : typeof err, 异常信息: message },
    );
    ctx.status = status;
    ctx.body = { error: status >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST", explain: message };
  }
});

app.use(bodyParser());
mountHealthRoutes(router);
mountFactsRoutes(router);
mountRecallRoutes(router);
mountTriggerRoutes(router);
mountTriggerStatusRoutes(router);
mountConversationRoutes(router);
mountStatusRoutes(router);
mountChatRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info(
    "server.start",
    "listening",
    "写入策略第九步（第 1 关「写入时机」完整版）：三种触发方式——热路径 eager（每轮同步写）/ 后台异步 background（不挡回复，紧接 recall 可能召回不到新事实）/ 会话结束 session-end（会话中库不变，close 后才结算）。本步核心 lib/flow/trigger-write.ts 按 mode 决定流水线何时跑；复用 step-7 的 lib/db.ts（SQLite via better-sqlite3 + data/facts.db）+ extract-facts 调真模型抽候选。",
    { url: `http://127.0.0.1:${PORT}/`, protocol: "A", callsModel: "true" },
  );
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
