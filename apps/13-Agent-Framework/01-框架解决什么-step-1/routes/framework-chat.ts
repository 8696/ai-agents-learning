/**
 * 职责：POST /api/framework-chat。给试用 useChat 的子页推界面消息流。
 *
 * 数据流：body.messages → pipeFrameworkChat → 写到 ctx.res。forceError=true 走 5xx。空用户句走 4xx。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import type { UIMessage } from "ai";
import { z } from "zod";
import { pipeFrameworkChat } from "../lib/flow/framework-chat.js";
import { logger } from "../lib/logger.js";

const bodySchema = z.object({
  messages: z.array(z.record(z.unknown())).optional(),
  forceError: z.boolean().optional(),
});

function lastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const item = messages[i];
    if (item.role !== "user") continue;
    return (item.parts ?? [])
      .filter((part) => part.type === "text")
      .map((part) => ("text" in part ? String(part.text) : ""))
      .join("")
      .trim();
  }
  return "";
}

export function mountFrameworkChatRoutes(router: Router): void {
  router.post("/api/framework-chat", async (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "入参不是合法 JSON 对象", issues: parsed.error.issues };
      return;
    }
    if (parsed.data.forceError) {
      ctx.status = 500;
      ctx.body = { ok: false, error: "演示后端 5xx：试用 useChat 这一侧故意失败，对照空输入的 4xx。" };
      return;
    }
    const messages = (parsed.data.messages ?? []) as unknown as UIMessage[];
    if (lastUserText(messages) === "") {
      ctx.status = 400;
      ctx.body = { ok: false, error: "客人口述不能是空字符串。请用默认「来一杯中杯热拿铁。」或自己写一句。" };
      return;
    }
    const abort = new AbortController();
    ctx.req.on("close", () => abort.abort());
    ctx.respond = false;
    try {
      await pipeFrameworkChat(messages, ctx.res, abort.signal);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("framework-chat.route", "结束：pipeFrameworkChat（失败）", "推流失败。", {
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
