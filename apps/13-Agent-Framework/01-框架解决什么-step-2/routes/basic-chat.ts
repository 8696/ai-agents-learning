/**
 * 职责：POST /api/basic-chat。给基础聊天子页推界面消息流。
 *
 * 数据流：body.system（用户改的系统提示词） + body.messages → pipeBasicChat → 写到 ctx.res。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import type { UIMessage } from "ai";
import { z } from "zod";
import { pipeBasicChat } from "../lib/flow/basic-chat.js";
import { logger } from "../lib/logger.js";

const bodySchema = z.object({
  messages: z.array(z.record(z.unknown())).optional(),
  system: z.string().optional(),
});

export function mountBasicChatRoutes(router: Router): void {
  router.post("/api/basic-chat", async (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "入参不是合法 JSON 对象", issues: parsed.error.issues };
      return;
    }
    const messages = (parsed.data.messages ?? []) as unknown as UIMessage[];
    const abort = new AbortController();
    ctx.req.on("close", () => abort.abort());
    ctx.respond = false;
    try {
      await pipeBasicChat(parsed.data.system, messages, ctx.res, abort.signal);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("basic-chat.route", "结束：pipeBasicChat（失败）", "推流失败。", {
        返回值: { message },
      });
      if (!ctx.res.headersSent) {
        ctx.res.statusCode = 500;
        ctx.res.setHeader("Content-Type", "application/json; charset=utf-8");
        ctx.res.end(JSON.stringify({ ok: false, error: message }));
      } else {
        ctx.res.end();
      }
    }
  });
}