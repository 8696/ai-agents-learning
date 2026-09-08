/**
 * 职责：POST /api/strict-rejected —— 故意发坏 schema，看 strict 在 API 入口拒不拒。
 * 数据流：无 prompt → runStrictRejected → 200+unexpectedSuccess 或 writeUpstreamError（期望 400）。
 * 本页教学点在 pages/strict-rejected.html。
 *
 * 日志（§5.3.16）：调用函数 五件套（handlePostStrictRejected 封装层）；
 *   Key 缺失单独打 info 闸门拒绝；真 400 是上游抛错由 catch 接住；unexpectedSuccess 是 warn。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { requireLlm } from "../lib/http/request-guards.js";
import { writeUpstreamError } from "../lib/http/write-upstream-error.js";
import { runStrictRejected } from "../lib/flow/run-strict-rejected.js";
import { logger } from "../lib/logger.js";

export function mountStrictRejectedRoutes(router: Router): void {
  router.post("/api/strict-rejected", async (ctx: Context) => {
    const tHandlerStart = Date.now();
    const client = requireLlm(ctx);
    if (!client) {
      logger.info(
        "api.strict-rejected",
        "POST /api/strict-rejected 被无 Key 闸门挡掉",
        "为什么打：服务端兜底；没 Key 就别让上游 SDK 抛一句读不懂的错。当前：apps/.env 当前 LLM_PROVIDER 无 Key。",
        { endpoint: "POST /api/strict-rejected" },
      );
      return;
    }

    console.log(
      `\n/api/strict-rejected: 故意发一个不严格 schema，让 OpenAI strict 返 400`,
    );
    logger.info(
      "api.strict-rejected",
      "调用函数开始：handlePostStrictRejected",
      "为什么打：route 只认这一层返回的 StrictRejectedOk 或 writeUpstreamError 的 400；里面 runStrictRejected 是「真活」。当前：故意发坏 schema 测 API 入口 400；记 provider / model 便于对照不同网关的 strict 行为。",
      {
        入参: { provider: client.provider, model: client.modelA },
        __code: `ctx.body = await runStrictRejected(client);\n// 或 catch 到上游 400 后 writeUpstreamError 写错误响应`,
      },
    );

    try {
      ctx.body = await runStrictRejected(client);
      logger.warn(
        "api.strict-rejected",
        "调用函数结束：handlePostStrictRejected",
        "为什么打：bad schema + strict 居然 200 → 网关是软约束而非 token-level mask；记 unexpectedSuccess 状态便于页面标成「诊断结果：网关未守约」。",
        {
          返回值: { mode: (ctx.body as { mode: string }).mode, unexpectedSuccess: (ctx.body as { unexpectedSuccess: boolean }).unexpectedSuccess, rawPreview: (ctx.body as { raw: string }).raw.slice(0, 200) },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  /api/strict-rejected 拿到预期 400: ${msg.slice(0, 300)}`);
      logger.info(
        "api.strict-rejected",
        "调用函数结束：handlePostStrictRejected",
        "为什么打：真 token-mask 的网关把 bad schema 拦在 API 入口；记错误信息便于核对是哪条 strict 规则触发；这是「预期 400」路径，不是异常。",
        {
          返回值: { mode: "json_schema_strict", rejected: true, upstreamMsg: msg.slice(0, 400) },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
      // 把 OpenAI 报错原文回前端——它会精确列出「哪条属性违反哪条 strict 规则」
      writeUpstreamError(ctx, err, {
        mode: "json_schema_strict",
        rejected: true,
      });
    }
  });
}