/**
 * 职责：POST /api/run/serialize-dirty。故意塞函数 / Map / Date，对照写入前与 stringify 之后，并拒绝写磁盘。
 * 数据流：校验 runId + kind → tryWriteDirtyCheckpoint → 返回探针全文。路由不自己做 JSON.stringify。
 * 为什么单独成文件：一个业务 URL 一个文件；合法走一步仍是 POST /api/run/step。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { isDirtyKind, tryWriteDirtyCheckpoint } from "../lib/flow/serialize-roundtrip.js";

const bodySchema = z.object({
  runId: z.string(),
  kind: z.string(),
});

const KIND_LABEL: Record<string, string> = {
  function: "函数（function）",
  map: "Map",
  date: "Date",
};

export function mountRunSerializeDirtyRoutes(router: Router): void {
  router.post("/api/run/serialize-dirty", (ctx: Context, _next: Next) => {
    const started = Date.now();
    logger.info(
      "路由-故意写入脏类型",
      "调用函数开始：POST /api/run/serialize-dirty",
      "为什么写这条日志：页面点了「故意塞函数 / Map / Date」。当前：刚进路由。",
      { 入参: ctx.request.body },
    );
    const parsed = bodySchema.safeParse(ctx.request.body);
    if (!parsed.success || !parsed.data.runId.trim()) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: { code: "BAD_BODY", message: "请求体需要非空的 runId，以及 kind（function / map / date）。" },
      };
      logger.error(
        "路由-故意写入脏类型",
        "调用函数结束：POST /api/run/serialize-dirty（失败）",
        "为什么写这条日志：没有任务运行编号。当前：已返回 400。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
      return;
    }
    const kindRaw = parsed.data.kind.trim();
    if (!isDirtyKind(kindRaw)) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: {
          code: "BAD_KIND",
          message: "kind 只能是 function、map 或 date。这是三种不能静默当成功的脏类型。",
        },
      };
      logger.error(
        "路由-故意写入脏类型",
        "调用函数结束：POST /api/run/serialize-dirty（失败）",
        "为什么写这条日志：kind 不在允许列表里。当前：已返回 400。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
      return;
    }

    try {
      const result = tryWriteDirtyCheckpoint(parsed.data.runId.trim(), kindRaw);
      ctx.body = {
        ok: true,
        ...result,
        请求参数: { runId: parsed.data.runId, kind: kindRaw },
        调用流程: [
          "取出当前状态（内存优先，没有则读磁盘上上一份合法快照）",
          "注入 " + KIND_LABEL[kindRaw],
          "JSON.stringify 再 JSON.parse，看这个字段还在不在、类型变没变",
          "判定：拒绝调用 writeCheckpoint，磁盘文件保持原样",
        ],
      };
      logger.info(
        "路由-故意写入脏类型",
        "调用函数结束：POST /api/run/serialize-dirty",
        "为什么写这条日志：对照完成且没有写文件。当前：把写入前 / 读回来交给页面。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      const notFound = err.code === "RUN_NOT_FOUND";
      ctx.status = notFound ? 400 : 500;
      ctx.body = {
        ok: false,
        error: {
          code: err.code ?? "SERIALIZE_DIRTY_FAILED",
          message: err.message ?? "对照脏类型失败",
        },
      };
      logger.error(
        "路由-故意写入脏类型",
        "调用函数结束：POST /api/run/serialize-dirty（失败）",
        "为什么写这条日志：找不到任务运行或序列化过程抛错。当前：已返回错误给页面。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
    }
  });
}
