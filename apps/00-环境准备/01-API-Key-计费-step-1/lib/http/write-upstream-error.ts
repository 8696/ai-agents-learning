/**
 * 职责：把「调模型时出的错」写成统一形状的 HTTP 响应。
 * 数据流：unknown err → ctx.status（能拿到上游码就用上游码）+ { error, upstreamStatus, hint? }。
 * 为什么单独成文件：两个计费 route 都要区分「上游报错」和「响应里没有 usage」两种失败，
 *   口径写在一处，前端才能只认一种错误字段。
 */
import type { Context } from "koa";
import { MissingUsageError } from "../flow/measure-types.js";

/** 上游 SDK 错误通常带 status（401 鉴权 / 429 限流 / 5xx）；带上它前端才能显示「上游 HTTP 429」。 */
function readUpstreamStatus(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null || !("status" in err)) return undefined;
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

/**
 * 计费 route 的统一 catch 出口。
 * ① MissingUsageError 单独走 502：这不是网络错，是「上游没回 usage」，
 *    对本条教学点很关键——没有 usage 就无法核对账单，只能去控制台看，不能靠猜；
 * ② 其余错误透传上游 status，拿不到才退回 500。
 */
export function writeMeasurementError(
  ctx: Context,
  err: unknown,
  extraBody: Record<string, unknown> = {},
): void {
  if (err instanceof MissingUsageError) {
    ctx.status = 502;
    ctx.body = {
      error: err.message,
      upstreamStatus: null,
      hint: "该网关这次没回 usage，Token 数只能去提供商控制台账单页核对，不要自己估。",
      ...extraBody,
    };
    return;
  }

  const upstreamStatus = readUpstreamStatus(err);
  ctx.status = upstreamStatus ?? 500;
  ctx.body = {
    error: err instanceof Error ? err.message : String(err),
    upstreamStatus: upstreamStatus ?? null,
    ...extraBody,
  };
}
