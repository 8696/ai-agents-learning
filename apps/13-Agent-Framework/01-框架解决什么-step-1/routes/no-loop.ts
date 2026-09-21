/**
 * 职责：GET /api/files。返回本 demo 自己的文件清单 + 每个文件标注
 * 「对应模块 07 的哪一段」+ 标出 while 真在哪。
 *
 * 数据流：query.forceBad=1 → 4xx；query.forceError=1 → 5xx；否则扫硬编码清单 →
 *         JSON。教学清单硬编码（标注与教学目标对齐），exists 字段从 fs 真扫。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Context } from "koa";
import type Router from "@koa/router";
import { logger } from "../lib/logger.js";

// 教学文件清单（按职责分组；硬编码，标注与教学目标对齐）。
// 模块 07 = 手写 Agent Loop 的那一课；本节对照手写版与框架版的「while 在哪」。
interface FileEntry {
  group: string;
  path: string;
  hasWhile: boolean;
  module07: string;
  exists?: boolean;
}
const FILE_LIST: FileEntry[] = [
  // 装配
  { group: "装配", path: "server.ts", hasWhile: false, module07: "装配：只挂路由和静态页，不写业务、不调模型。同模块 00 mini-app。" },
  // 路由（routes/）
  { group: "路由", path: "routes/health.ts", hasWhile: false, module07: "GET /health：报 provider / model / hasKey。无业务循环。" },
  { group: "路由", path: "routes/handwritten-loop.ts", hasWhile: true, module07: "★ 调 lib/flow/handwritten-loop.ts 的手写 while；模块 07 对照基准。" },
  { group: "路由", path: "routes/framework-loop.ts", hasWhile: false, module07: "调 lib/flow/framework-loop.ts：一次 generateText，没 while。" },
  { group: "路由", path: "routes/framework-chat.ts", hasWhile: false, module07: "调 lib/flow/framework-chat.ts：推流 useChat，没 while。" },
  { group: "路由", path: "routes/no-loop.ts", hasWhile: false, module07: "★ 本页面：GET /api/files，无循环。" },
  // lib/cafe
  { group: "lib/cafe", path: "lib/cafe/cafe-shared.ts", hasWhile: false, module07: "店名 / 菜单 / 工具名（模块 12）。" },
  { group: "lib/cafe", path: "lib/cafe/make-latte.ts", hasWhile: false, module07: "吧台工具 make_latte（模块 05 工具协议）。" },
  { group: "lib/cafe", path: "lib/cafe/model.ts", hasWhile: true, module07: "★ while 真在那：调 streamText 那一跳；藏在 SDK 回调里。" },
  // lib/flow
  { group: "lib/flow", path: "lib/flow/handwritten-loop.ts", hasWhile: true, module07: "★ 模块 07 手写 while 核心：自己写 while，自己拼 messages。" },
  { group: "lib/flow", path: "lib/flow/framework-loop.ts", hasWhile: false, module07: "框架版：调一次 generateText，没 while。" },
  { group: "lib/flow", path: "lib/flow/framework-chat.ts", hasWhile: false, module07: "框架版流式：pipeUIMessageStreamToResponse，没 while。" },
  // lib/http
  { group: "lib/http", path: "lib/http/runtime-ctx.ts", hasWhile: false, module07: "端口解析兜底。" },
  // lib
  { group: "lib", path: "lib/logger.ts", hasWhile: false, module07: "本地 freeze 副本：日志写入 apps/.../logs/{YYYY-MM-DD}.log。" },
  // public
  { group: "public", path: "public/index.html", hasWhile: false, module07: "首页：手写 while 出一杯拿铁。" },
  { group: "public/pages", path: "public/pages/framework.html", hasWhile: false, module07: "子页：框架循环（generateText）。" },
  { group: "public/pages", path: "public/pages/use-chat.html", hasWhile: false, module07: "子页：试用 useChat 推流。" },
  { group: "public/pages", path: "public/pages/no-loop.html", hasWhile: false, module07: "★ 本页面。" },
  { group: "public/components", path: "public/components/page-nav.js", hasWhile: false, module07: "跨页导航条（无循环）。" },
  { group: "public/components", path: "public/components/layout.js", hasWhile: false, module07: "PageIntro / StatusPill / EnvFooter（无循环）。" },
  { group: "public/components", path: "public/components/run-result.js", hasWhile: false, module07: "跑结果卡（无循环）。" },
  { group: "public/utils", path: "public/utils/fetch-json.js", hasWhile: false, module07: "postJson / loadHealth（无循环）。" },
];

const WHILE_LOCATIONS = [
  { file: "lib/flow/handwritten-loop.ts", kind: "handwritten", description: "你自己写的 while（模块 07 那一套）。" },
  { file: "lib/cafe/model.ts", kind: "framework", description: "while 藏在 SDK 调 streamText 的回调里；你的文件里没有 while。" },
];

const SUMMARY = "这个 demo 里没有 loop.ts。while 在两处：手写版在 lib/flow/handwritten-loop.ts（你写的，模块 07 那一套）；框架版在 lib/cafe/model.ts 调 streamText 的回调里（库写的，藏在 SDK 内部）。流程还是想→做→看。";

function annotateExistence(demoRoot: string): void {
  for (const item of FILE_LIST) {
    item.exists = fs.existsSync(path.join(demoRoot, item.path));
  }
}

export function mountNoLoopRoutes(router: Router): void {
  router.get("/api/files", async (ctx: Context) => {
    const t0 = Date.now();
    const forceError = ctx.query.forceError === "1";
    const forceBad = ctx.query.forceBad === "1";
    logger.info(
      "no-loop.route",
      "开始：GET /api/files",
      "新同事视角：把仓库文件摊开 + 标注 while 在哪 + 模块 07 对照。当前：刚收到请求，还没扫文件。",
      {
        入参: { query: ctx.query, forceError, forceBad },
      }
    );
    try {
      if (forceBad) {
        ctx.status = 400;
        ctx.body = { ok: false, error: "演示 4xx：模拟入参不合规（比如 query 字段名错）。" };
        logger.warn(
          "no-loop.route",
          "结束：GET /api/files（4xx）",
          "强制 4xx 演示：覆盖默认值 4xx 一类错误。",
          {
            耗时ms: Date.now() - t0,
            返回值: ctx.body,
          }
        );
        return;
      }
      if (forceError) {
        ctx.status = 500;
        ctx.body = { ok: false, error: "演示 5xx：模拟服务端异常（文件清单服务挂了）。" };
        logger.error(
          "no-loop.route",
          "结束：GET /api/files（失败）",
          "强制 5xx 演示：覆盖另一类错误通道。",
          {
            耗时ms: Date.now() - t0,
            返回值: ctx.body,
          }
        );
        return;
      }
      const demoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
      annotateExistence(demoRoot);
      const demoDir = "apps/13-Agent-Framework/01-框架解决什么-step-1/";
      ctx.body = {
        ok: true,
        demoDir,
        whileLocations: WHILE_LOCATIONS,
        files: FILE_LIST,
        summary: SUMMARY,
      };
      logger.info(
        "no-loop.route",
        "结束：GET /api/files",
        "返回硬编码清单 + 教学标注 + exists 真扫。",
        {
          耗时ms: Date.now() - t0,
          返回值: ctx.body,
        }
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.status = 500;
      ctx.body = { ok: false, error: message };
      logger.error(
        "no-loop.route",
        "结束：GET /api/files（失败）",
        "扫清单抛错（不应发生，列为兜底）。",
        {
          耗时ms: Date.now() - t0,
          返回值: { message },
        }
      );
    }
  });
}
