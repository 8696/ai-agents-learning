/**
 * 职责：GET /api/snapshot —— 读当前账本 + 待审批；同时承担变体 G 的「过期检测 + 自动拒绝」副作用。
 * 数据流：getSnapshot → 检查 pending 是否过期 → 过期调 rejectTransfer（写盘） → 返回 snapshot + secondsLeft。
 * 为什么单独成文件：一个业务 URL 一个文件；和提议 / 通过不是同一条路径。
 *
 * 副作用说明：snapshot 路由原本是「只读」；变体 G 要求超时默认拒绝，必须有个地方主动检测。
 *   前端用 setInterval 每秒拉一次 snapshot（同时拿 secondsLeft 渲染倒计时）—— 这是最自然的心跳；
 *   后端在 snapshot 路由检测到过期就调 rejectTransfer 完成「超时 = 拒绝」的语义。
 *   重新加载或定时器停了都无所谓：下次任意一条路径（snapshot / approve / reject）进来都会先查过期。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import {
  getPending,
  getSecondsLeft,
  getSnapshot,
  isPendingExpired,
  rejectTransfer,
  type RunSnapshot,
} from "../lib/flow/pause-before-side-effect.js";
import { logger } from "../lib/logger.js";

export function mountSnapshotRoutes(router: Router): void {
  router.get("/api/snapshot", (ctx: Context, _next: Next) => {
    const t0 = Date.now();
    logger.info(
      "GET /api/snapshot",
      "调用函数开始：GET /api/snapshot",
      "为什么写这条日志：页面要每秒拉一次拿倒计时；同时这里要查过期 → 自动拒绝。当前：路由进入。",
      { 入参: {}, __code: "if (isPendingExpired(getPending())) rejectTransfer(getPending().runId); return snapshot + secondsLeft;" },
    );

    // 变体 G · 超时检测：每次 snapshot 都查一次。过期就自动走拒绝路径（写盘、清盘、改 status）。
    const pendingNow = getPending();
    if (pendingNow && isPendingExpired(pendingNow)) {
      try {
        rejectTransfer(pendingNow.runId);
      } catch (err: unknown) {
        // 超时拒绝失败不应阻塞 snapshot；日志记录，继续返回。
        logger.warn(
          "GET /api/snapshot",
          "超时拒绝失败（不影响 snapshot 返回）",
          "为什么写这条日志：自动拒绝是副作用，失败要可见但不阻断当前请求。当前：pending 状态可能不一致。",
          { 返回值: { error: err instanceof Error ? err.message : String(err) } },
        );
      }
    }

    // 直接调 getSnapshot 拿当前状态（如果上面自动 reject 了，状态已是 rejected）。
    const snapshot: RunSnapshot = getSnapshot();
    const secondsLeft = getSecondsLeft(snapshot.pending);
    ctx.body = {
      ok: true,
      snapshot,
      secondsLeft,
      timeoutMs: 30_000,
      isExpired: snapshot.pending !== null && snapshot.pending.status === "waiting" && secondsLeft === 0,
    };
    logger.info(
      "GET /api/snapshot",
      "调用函数结束：GET /api/snapshot",
      "为什么写这条日志：页面要拿秒数渲染倒计时。当前：已写 200。",
      { 返回值: ctx.body, 耗时ms: Date.now() - t0 },
    );
  });
}
