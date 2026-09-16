/**
 * 职责：装配 HTTP 服务。只挂中间件和路由，不写业务。
 * 数据流：bodyParser → routes → 静态 public → listen 127.0.0.1:PORT。
 *
 * step-12 第 7 关「压缩与摘要」完整版：本步核心 lib/flow/compress.ts 单独成文件 + lib/flow/capacity-merge.ts 单独成文件。
 * 变体 7-ABC：整段 → 会话摘要 + 多条 → 画像两种压缩都演示。
 * 变体 7-D：库容量上限 + 自动触发合并（按钮触发代替 cron；同 demo 同端口同一 lib/flow/ 核心，按 §5.3.14 改动很小例外）。
 * 路由：POST /api/compress-session 调 compressSession（压缩一段对话原文成摘要）+ POST /api/compress-image 调 mergeFactsToImage（合并多条事实成画像）+ GET /api/capacity + POST /api/capacity/config（设 / 取阈值）+ POST /api/auto-merge/write（写新事实 + 检查容量 + 超阈自动合并到 user_profile_auto）。
 * 四个 URL 按业务相关度分四个 route 文件（§5.3.8）。
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
import { mountCompressSessionRoutes } from "./routes/compress-session.js";
import { mountCompressImageRoutes } from "./routes/compress-image.js";
import { mountCapacityGetRoutes } from "./routes/capacity-get.js";
import { mountCapacityConfigRoutes } from "./routes/capacity-config.js";
import { mountAutoMergeWriteRoutes } from "./routes/auto-merge-write.js";
import { mountLibraryRoutes } from "./routes/library.js";
import { mountRecallPreviewRoutes } from "./routes/recall-preview.js";
import { mountRecallPreviewControlRoutes } from "./routes/recall-preview-control.js";

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
mountCompressSessionRoutes(router);
mountCompressImageRoutes(router);
mountCapacityGetRoutes(router);
mountCapacityConfigRoutes(router);
mountAutoMergeWriteRoutes(router);
mountLibraryRoutes(router);
mountRecallPreviewRoutes(router);
mountRecallPreviewControlRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info(
    "server.start",
    "listening",
    "写入策略第十二步（第 7 关「压缩与摘要」完整版 + 变体 7-D「库容量上限 + 自动合并」）：三个 sub-page 共享同一 demo + 同一端口 + 同一 lib/flow/ 核心（按 §5.3.14 改动很小例外，不开新 step-N+1）。\n变体 7-A：整段 → 会话摘要（POST /api/compress-session 调 compressSession 压原文成 5 行摘要）；变体 7-C：多条 → 画像（POST /api/compress-image 调 mergeFactsToImage 合并多条零碎事实成一段画像）。变体 7-D：库容量上限 + 自动触发合并（POST /api/auto-merge/write 写新事实 → POST /api/capacity 查阈值 + GET /api/capacity 读阈值 → 超阈自动合并零碎事实到 user_profile_auto）。变体 7-D 满足笔记 §7 设计原则「库有容量上限逼着系统定期做减法」（Letta / MemGPT）；本步用按钮触发代替 cron 定时——演示库自治能力。本步核心 lib/flow/compress.ts（7-A / 7-C）+ lib/flow/capacity-merge.ts（7-D）单独成文件；调真模型每次自动合并一次（合并时）。复用 step-11 的 lib/db.ts + 新增 summary 列存事实的「压缩结果」字段。满足需求 7 验收 ① ② ③ ④ + 7-D 设计原则。",
    { url: `http://127.0.0.1:${PORT}/`, protocol: "A", callsModel: "true" },
  );
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
