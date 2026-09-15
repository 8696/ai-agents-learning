/**
 * 职责：装配 HTTP 服务。只挂中间件和路由，不写业务。
 * 数据流：bodyParser → routes → 静态 public → listen 127.0.0.1:PORT。
 *
 * step-11 第 6 关变体 6-D「被新事实挤掉」完整版：给事实加 expires_with 关联键（指明这条事实在「另一条事实写入时自动归档」）。本步核心 lib/flow/expire-linked.ts 单独成文件。复用 step-10 的 lib/db.ts + 路由架构 + lib/flow/extract-facts.ts 调真模型抽候选。
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { logger } from "./lib/logger.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountSeedRoutes } from "./routes/seed.js";
import { mountExpireLinkedRoutes } from "./routes/expire-linked.js";
import { mountRecallRoutes } from "./routes/recall.js";
import { mountArchiveRoutes } from "./routes/archive.js";

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
mountSeedRoutes(router);
mountExpireLinkedRoutes(router);
mountRecallRoutes(router);
mountArchiveRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info(
    "server.start",
    "listening",
    "写入策略第十一步（第 6 关变体 6-D「被新事实挤掉」完整版）：给事实加 expires_with 关联键（指明这条事实在「另一条事实写入时自动归档」）。本步核心 lib/flow/expire-linked.ts 单独成文件；调真模型做抽取（POST /api/expire-linked 调 extractFacts + 写库 + expireLinkedFacts）。复用 step-10 的 lib/db.ts + lib/flow/extract-facts.ts + routes/recall.ts + routes/archive.ts + routes/time-skip.ts。变体 6-D 让需求 6 验收 ②「我毕业了挤掉在读学校」终于可以演示。",
    { url: `http://127.0.0.1:${PORT}/`, protocol: "A", callsModel: "true" },
  );
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});