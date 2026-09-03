/**
 * 职责：三个 SSE 端点进入开流之前的闸门 —— 入参校验、以及「还没开流就失败」时怎么回话。
 * 数据流：
 *   ctx.request.body → Zod → { ok:true, message, abortAfterFrames } | { ok:false, reason }
 *   失败 → writeRawJson(res, 400 | 503, { error }) → 普通 JSON（不是 SSE）
 * 为什么单独成文件：
 *   SSE 路由必须 `ctx.respond = false`，koa 的 `ctx.body` 从此不再生效，
 *   所有早期失败都要手写 `res.writeHead/end`。这是 HTTP 怎么回话，不是怎么调模型。
 */
import type { ServerResponse } from "node:http";
import { z } from "zod";

const bodySchema = z.object({
  // 空字符串直接挡掉：页面「发空消息」按钮走这条 400，不花模型额度也能看见参数错
  message: z.string().trim().min(1, "message 不能为空"),
  // 只有 cancel 端点用；另外两个忽略。上限 200 防止一次点下去收几百帧才 abort
  abortAfterFrames: z.coerce.number().int().positive().max(200).optional(),
});

export type AbortBody = {
  message: string;
  abortAfterFrames: number;
};

export type AbortBodyResult =
  | { ok: true; message: string; abortAfterFrames: number }
  | { ok: false; reason: string };

/**
 * 校验三个 POST 端点共用的 body。
 * abortAfterFrames 缺省 5：和原 Demo「收 5 帧就停」对齐，页面不填也能跑。
 */
export function parseAbortBody(raw: unknown): AbortBodyResult {
  const parsed = bodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, reason: first?.message ?? "请求体不合法" };
  }
  return {
    ok: true,
    message: parsed.data.message,
    abortAfterFrames: parsed.data.abortAfterFrames ?? 5,
  };
}

/**
 * 在 `ctx.respond = false` 之后写一个普通 JSON 响应。
 * 只能用在**还没 writeHead(200, text/event-stream) 之前**：
 * 头一旦发出去就只能再发 SSE 帧，400 会变成「成功但是空」的流。
 */
export function writeRawJson(
  res: ServerResponse,
  status: number,
  payload: Record<string, unknown>,
): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}
