/**
 * 职责：POST /api/run/set-graph-version。设置进程内 currentGraphVersion（变体 J 演示）。
 * 数据流：校验 version → setCurrentGraphVersion → 返回新版本号。
 * 为什么单独成文件：一个业务 URL 一个文件。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { getCurrentGraphVersion, setCurrentGraphVersion } from "../lib/flow/graph-version.js";

const bodySchema = z.object({
  version: z.string(),
});

export function mountRunSetGraphVersionRoutes(router: Router): void {
  router.post("/api/run/set-graph-version", (ctx: Context, _next: Next) => {
    const started = Date.now();
    logger.info(
      "路由-切换图版本",
      "调用函数开始：POST /api/run/set-graph-version",
      "为什么写这条日志：图版本失败可见页点了「切到 v2」。",
      { 入参: ctx.request.body },
    );
    const parsed = bodySchema.safeParse(ctx.request.body);
    if (!parsed.success || !parsed.data.version.trim()) {
      ctx.status = 400;
      ctx.body = { ok: false, error: { code: "BAD_BODY", message: "请求体需要非空的字符串字段 version。" } };
      logger.error(
        "路由-切换图版本",
        "调用函数结束：POST /api/run/set-graph-version（失败）",
        "为什么写这条日志：版本号为空。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
      return;
    }
    const version = parsed.data.version.trim();
    setCurrentGraphVersion(version);
    ctx.body = {
      ok: true,
      graphVersion: getCurrentGraphVersion(),
      请求参数: { version },
      调用流程: [
        "进程内 currentGraphVersion 已更新",
        "之后再走一步 → CheckpointRecord.graphVersion = 新版本",
        "旧检查点加载时抛 GRAPH_VERSION_MISMATCH（变体 J）",
      ],
    };
    logger.info(
      "路由-切换图版本",
      "调用函数结束：POST /api/run/set-graph-version",
      "为什么写这条日志：图版本已切。",
      { 返回值: ctx.body, 耗时ms: Date.now() - started },
    );
  });
}
