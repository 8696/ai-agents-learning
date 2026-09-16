/**
 * 职责：装配 HTTP 服务。只挂中间件和路由，不写业务。
 * 数据流：bodyParser → routes → 静态 public → listen 127.0.0.1:PORT。
 *
 * step-13 第 8 关「写入安全与审计」完整版：本步核心 lib/flow/*.ts 拆四文件（poison / audit-write /
 * audit-rollback / idempotent）单独成文件 + lib/store-*.ts 拆三文件（kv / audit / idempotency）。
 * 三个 sub-page 共享同一 demo + 同一端口 + 同一 lib/flow/ 核心（按 §5.3.14「改动很小」例外，不开新 step-N+1）。
 *
 * 路由（一个业务 URL 一个文件 · §5.3.8）：
 *   - POST /api/poison/check       （routes/poison.ts          ；8-A 投毒拦截，调真模型）
 *   - POST /api/audit/write        （routes/audit-write.ts     ；8-B 审计写入）
 *   - GET  /api/audit + /:id       （routes/audit-list.ts      ；8-B 审计表列表 + 单条详情）
 *   - POST /api/audit/rollback     （routes/audit-rollback.ts  ；8-B 一键撤回）
 *   - POST /api/idempotent/write   （routes/idempotent.ts      ；8-C 写入幂等）
 *   - GET  /api/library            （routes/library.ts         ；前端 library 面板）
 *   - POST /api/seed               （routes/seed.ts            ；演示用灌示例）
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
import { mountLibraryRoutes } from "./routes/library.js";
import { mountPoisonRoutes } from "./routes/poison.js";
import { mountAuditWriteRoutes } from "./routes/audit-write.js";
import { mountAuditListRoutes } from "./routes/audit-list.js";
import { mountAuditRollbackRoutes } from "./routes/audit-rollback.js";
import { mountIdempotentRoutes } from "./routes/idempotent.js";

const app = new Koa();
const router = new Router();

// 全局错误处理：route 内 throw → 返回 JSON 而不是 koa 默认 HTML 错误页
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
mountLibraryRoutes(router);
mountPoisonRoutes(router);
mountAuditWriteRoutes(router);
mountAuditListRoutes(router);
mountAuditRollbackRoutes(router);
mountIdempotentRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info(
    "server.start",
    "listening",
    "写入策略第十三步（第 8 关「写入安全与审计」完整版）：三个 sub-page 共享同一 demo + 同一端口 + 同一 lib/flow/ 核心（按 §5.3.14 改动很小例外，不开新 step-N+1）。\n变体 8-A：投毒拦截（POST /api/poison/check 调 lib/flow/poison.detectPoisoning 投毒判定；让模型给 category / isPoisoned / reason；满足笔记 §0 需求 8 验收 ①）。\n变体 8-B：审计表 + 一键撤回（POST /api/audit/write 调 lib/flow/audit-write.recordAuditWrite 写一条事实 + audit_log；GET /api/audit + GET /api/audit/:id 列表 / 详情；POST /api/audit/rollback 调 lib/flow/audit-rollback.rollbackAuditById 按 action 反向恢复 + 标 rolled_back_at；满足需求 8 验收 ②③）。\n变体 8-C：写入幂等（POST /api/idempotent/write 调 lib/flow/idempotent.writeWithIdempotency 同 idempotencyKey 重复只生效一次；满足需求 8 验收 ④）。\n本步核心 lib/flow/* 拆四文件（poison / audit-write / audit-rollback / idempotent）单独成文件；lib/store-* 拆三文件（kv / audit / idempotency）；调真模型 1 次（投毒判定）/ 审计 + 幂等为本地 SQL；复用 §5.3.17 KV 抽象 + 新增 audit_log（7 字段）+ idempotency_keys（key / request_hash / response / audit_id）两表。",
    { url: `http://127.0.0.1:${PORT}/`, protocol: "A", callsModel: "true" },
  );
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
