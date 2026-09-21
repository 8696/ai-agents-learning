/**
 * 职责：POST /api/chat-stream。给流式 UI 教学点推界面消息流。
 *
 * 数据流：body.messages → pipeChatStream → 写到 ctx.res。forceError=true 走 5xx。空用户句走 4xx。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import type { UIMessage } from "ai";
import { z } from "zod";
import { pipeChatStream } from "../lib/flow/chat-stream.js";
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

export function mountChatStreamRoutes(router: Router): void {
  router.post("/api/chat-stream", async (ctx: Context) => {
    const t0 = Date.now();
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "入参不是合法 JSON 对象", issues: parsed.error.issues };
      logger.warn(
        "chat-stream.route",
        "结束：POST /api/chat-stream（4xx）",
        "入参不是合法 JSON 对象。",
        {
          耗时ms: Date.now() - t0,
          返回值: ctx.body,
        }
      );
      return;
    }
    if (parsed.data.forceError) {
      ctx.status = 500;
      ctx.body = { ok: false, error: "演示后端 5xx：流式 UI 教学点故意失败，对照空输入的 4xx。" };
      logger.error(
        "chat-stream.route",
        "结束：POST /api/chat-stream（失败）",
        "强制 5xx 演示。",
        {
          耗时ms: Date.now() - t0,
          返回值: ctx.body,
        }
      );
      return;
    }
    const messages = (parsed.data.messages ?? []) as unknown as UIMessage[];
    if (lastUserText(messages) === "") {
      ctx.status = 400;
      ctx.body = { ok: false, error: "客人口述不能是空字符串。请用默认「来一杯中杯热拿铁。」或自己写一句。" };
      logger.warn(
        "chat-stream.route",
        "结束：POST /api/chat-stream（4xx）",
        "空用户句走 4xx。",
        {
          耗时ms: Date.now() - t0,
          返回值: ctx.body,
        }
      );
      return;
    }
    const abort = new AbortController();
    ctx.req.on("close", () => abort.abort());
    ctx.respond = false;
    logger.info(
      "chat-stream.route",
      "开始：POST /api/chat-stream",
      "流式 UI 教学点：useChat 接住 SSE 流；服务端业务文件里没有 while。",
      {
        入参: { messages },
        __code: "ctx.respond = false; await pipeChatStream(messages, ctx.res, abort.signal);",
      }
    );
    try {
      await pipeChatStream(messages, ctx.res, abort.signal);
      logger.info(
        "chat-stream.route",
        "结束：POST /api/chat-stream",
        "流已写入响应。",
        {
          耗时ms: Date.now() - t0,
        }
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        "chat-stream.route",
        "结束：POST /api/chat-stream（失败）",
        "推流失败。",
        {
          耗时ms: Date.now() - t0,
          返回值: { message },
        }
      );
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