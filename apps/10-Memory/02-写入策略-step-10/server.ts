/**
 * 职责：装配 HTTP 服务。只挂中间件和路由，不写业务。
 * 数据流：bodyParser → routes → 静态 public → listen 127.0.0.1:PORT。
 *
 * step-10 第 6 关「过期」完整版：变体 6-B 自带有效期（validUntil + scanForExpired 归档）+ 变体 6-C 不用就衰减（last_used_at + use_count + computeDecayWeight 权重排序）+ 变体 6-A 永不过期（validUntil=null）。
 * 核心：lib/flow/expiration.ts（scanForExpired / computeDecayWeight / recallWithDecay / listArchived）。
 * 复用 step-7/9 的 lib/db.ts（kv 表 + §5.3.17 KV 抽象）；本步新增三个字段（archived_at / last_used_at / use_count），启动时 ALTER TABLE 兼容 step-9 旧库。
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { logger } from "./lib/logger.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountRecallRoutes } from "./routes/recall.js";
import { mountArchiveRoutes } from "./routes/archive.js";
import { mountTimeSkipRoutes } from "./routes/time-skip.js";
import { mountSeedRoutes } from "./routes/seed.js";
import { mountScoreImportanceRoutes } from "./routes/score-importance.js";
import { mountForceErrorRoutes } from "./routes/force-error.js";

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
mountScoreImportanceRoutes(router);
mountRecallRoutes(router);
mountArchiveRoutes(router);
mountTimeSkipRoutes(router);
mountForceErrorRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info(
    "server.start",
    "listening",
    "写入策略第十步（第 6 关「过期」完整版）：变体 6-A 永不过期 + 6-B 自带有效期（validUntil + scanForExpired 归档，写 archived_at 而不是物理删除）+ 6-C 不用就衰减（last_used_at + use_count + computeDecayWeight 权重排序 + 命中后更新）。本步核心 lib/flow/expiration.ts 单独成文件；本步调真模型做「让模型评估重要性」（POST /api/score-importance）—— 笔记 §6 「谁判、代码判」分工表里模型负责业务判断（事实是否永不过期 + 多快过期 + 重要程度），代码负责确定性逻辑（衰减公式 + 归档 + 排序）。复用 step-7/9 的 lib/db.ts，新增 archived_at/last_used_at/use_count/importance/importance_reasoning 五字段，启动时 ALTER TABLE 兼容 step-9 旧库。变体 6-D「被新事实挤掉」留给后续 step。",
    { url: `http://127.0.0.1:${PORT}/`, protocol: "A", callsModel: "true" },
  );
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});