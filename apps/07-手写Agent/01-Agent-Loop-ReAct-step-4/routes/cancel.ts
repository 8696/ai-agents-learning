/**
 * 职责：POST /api/cancel/:runId —— 触发用户取消（变体 M 主教学点）。
 *
 * 数据流：
 *   浏览器点「取消」按钮 → fetch POST /api/cancel/:runId
 *     → cancelRun(runId) 找到 controller → abort("user_cancelled")
 *       → loop.ts 下一次 LLM 调用立刻抛 AbortError → while 退出 → finishRun(status=cancelled)
 *         → 前端轮询 GET 拿到 status=cancelled + trajectory 完整保留
 *
 * 教学锚点（§5.3.2 #2 · 错误处理 / 状态语义）：
 *   - runId 不存在或已结束 → 200 + { cancelled: false, reason: "not_running" }（不是 404；
 *     教学场景：用户重复点取消 / loop 已自然结束才点取消）
 *   - run 仍在跑 → 200 + { cancelled: true, runId }
 *   - 永远不返 4xx / 5xx —— 取消是一个「幂等最佳努力」操作，语义是「请不要再开下一圈」，
 *     即使没找到目标也不应该报错（前端 UI 已经从 running → cancelled 状态机走过去了）
 *
 * 不在 step-4：超时取消（变体 L）、批量取消某个用户的全部 run —— 留后续。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { logger } from "../lib/logger.js";
import { cancelRun, getRun } from "../lib/cancellation.js";

export function mountCancelRoutes(router: Router): void {
  router.post("/api/cancel/:runId", (ctx: Context) => {
    const { runId } = ctx.params;

    const before = getRun(runId);
    const existed = before !== undefined;
    const wasRunning = before?.status === "running";

    logger.info("cancel.signal", "调用函数开始：cancel",
      "为什么打：变体 M 教学点 —— 取消是一笔独立事件；要打完整入参 + 当前 run 状态，事后回看能讲清「用户在第几圈点的取消」。当前：拿到 runId，准备 abort。",
      {
        runId,
        入参: { runId },
        本轮为什么是这些参数: {
          runId: "POST /api/agent-run 返回的 id；前端状态机用它找 controller",
          beforeStatus: existed ? before?.status : "not_found",
          beforeRounds: existed ? before?.rounds ?? 0 : 0,
        },
        __code: "const ok = cancelRun(runId, 'user_cancelled');",
      });

    const ok = cancelRun(runId, "user_cancelled");

    logger.info("cancel.signal", "调用函数结束：cancel",
      "为什么写这条日志：要把 abort() 是否真的触发记下来；不写就讲不清「取消按钮到底有没有用」。当前：controller.abort() 触发；loop 下次 while 检测 signal.aborted → break。",
      {
        runId,
        返回值: { cancelled: ok, existed, wasRunning },
        字段释义: {
          "cancelled": "true = abort() 触发；false = runId 不存在 / 已结束",
          "existed": "runId 是否在 registry 里（取消幂等检查）",
          "wasRunning": "取消触发瞬间 run 是不是还在跑（前端 UI 用来判定按钮可见性）",
        },
      });

    ctx.body = {
      cancelled: ok,
      runId,
      existed,
      wasRunning,
    };
  });
}