/**
 * 职责：POST /api/chat 进入 SSE 之前的两道闸门 —— 入参校验、以及「还没开流就失败」时怎么回话。
 *
 * 数据流：
 *   ctx.request.body → Zod → { ok: true, message } | { ok: false, reason }
 *   失败 → writeRawJson(res, 400 | 503, { error }) → 普通 JSON 响应（不是 SSE）
 *
 * 为什么单独成文件：
 *   SSE 路由必须 `ctx.respond = false`，koa 的 `ctx.body` 从此不再生效，
 *   所有早期失败都要手写 `res.writeHead/end`。这段是「HTTP 怎么回话」，
 *   和 lib/flow 里「怎么调模型」是两件事，混在一起 route 会变厚。
 */
import type { ServerResponse } from "node:http";
import { z } from "zod";

// ── 入参契约：只有一条 user 消息，空字符串直接挡掉（§5.3.12 服务端显式校验） ──
const chatBodySchema = z.object({
  message: z.string().trim().min(1, "message 不能为空"),
});

export type ChatBodyResult =
  | { ok: true; message: string }
  | { ok: false; reason: string };

/**
 * 校验 POST /api/chat 的 body。
 * 页面上「故意发空 message」按钮走的就是这条 false 分支 —— 不花模型额度也能看见 400。
 */
export function parseChatBody(raw: unknown): ChatBodyResult {
  const parsed = chatBodySchema.safeParse(raw);
  if (!parsed.success) {
    // 只取第一条 issue：页面要显示的是「哪里不合法」，不是整份 Zod 报告
    const first = parsed.error.issues[0];
    return { ok: false, reason: first?.message ?? "请求体不合法" };
  }
  return { ok: true, message: parsed.data.message };
}

/**
 * 在 `ctx.respond = false` 之后写一个普通 JSON 响应。
 * 只能用在**还没 writeHead(200, text/event-stream) 之前**：头一旦发出去就只能再发 SSE 帧了，
 * 这也是为什么校验必须排在开流之前（顺序换了 → 400 会变成一个 200 的空流）。
 */
export function writeRawJson(
  res: ServerResponse,
  status: number,
  payload: Record<string, unknown>,
): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}
