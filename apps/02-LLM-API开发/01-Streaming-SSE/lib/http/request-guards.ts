/**
 * 职责：三条业务端点共用的 HTTP 闸门 —— 故意 400、没 Key 的 503、POST /api/real 的 prompt。
 *
 * 数据流：
 *   query.fail=1 → writeRawJson(400)（模拟流 / 一次性对照页用来演示 HTTP 错误，不花额度）
 *   POST body.prompt → Zod → { ok:true, prompt } | { ok:false, reason }
 *   没 Key → writeRawJson(503)（必须在开 SSE 流之前）
 *
 * 为什么单独成文件：
 *   SSE 路由必须 `ctx.respond = false`，koa 的 `ctx.body` 从此不再生效，
 *   所有早期失败都要手写 `res.writeHead/end`。这段是「HTTP 怎么回话」，
 *   和 lib/flow 里「怎么推帧 / 怎么调模型」是两件事。
 */
import type { ServerResponse } from "node:http";
import type { Context } from "koa";
import { z } from "zod";

const realBodySchema = z.object({
  prompt: z.string().trim().min(1, "prompt 不能为空"),
});

export type RealPromptResult =
  | { ok: true; prompt: string }
  | { ok: false; reason: string };

/**
 * 在 `ctx.respond = false` 之后写一个普通 JSON 响应。
 * 只能用在**还没 writeHead(200, text/event-stream) 之前**：头一旦发出去就只能再发 SSE 帧了。
 */
export function writeRawJson(
  res: ServerResponse,
  status: number,
  payload: Record<string, unknown>,
): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

/**
 * 场景页「故意打坏请求」走这条：GET ?fail=1 → 400。
 * 模拟流本身不需要 Key，所以用 query 制造一个看得见的 HTTP 4xx，而不是去碰模型。
 */
export function isIntentionalFail(ctx: Context): boolean {
  const raw = ctx.query.fail;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "1" || value === "true";
}

/**
 * 校验 POST /api/real 的 body。
 * 页面上「故意发空 prompt」按钮走的就是这条 false 分支 —— 不花额度也能看见 400。
 * GET /api/real 不走这里，用 flow 里的默认句子。
 */
export function parseRealPrompt(raw: unknown): RealPromptResult {
  const parsed = realBodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, reason: first?.message ?? "请求体不合法" };
  }
  return { ok: true, prompt: parsed.data.prompt };
}
