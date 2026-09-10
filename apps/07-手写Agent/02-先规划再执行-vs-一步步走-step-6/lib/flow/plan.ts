/**
 * 职责：只规划、不执行 —— 调真规划器吐 v1，status=pending。确认前无副作用。
 * 数据流：task → doPlan(1) → { steps, rawText, fallback }。不调用 invokeTool。
 * 为什么单独成文件：变体 F 的第一阶段必须和执行拆开，避免「一个按钮既规划又执行」。
 */

import { logger } from "../logger.js";
import { doPlan } from "./parse-plan.js";
import type { PlanVersion } from "../types.js";

export async function planOnly(task: string): Promise<PlanVersion> {
  const t0 = Date.now();
  logger.info(
    "调用函数-planOnly",
    "调用函数开始：planOnly",
    "为什么写这条日志：变体 F 关键 —— 第一次只调规划器，不调执行器；状态 = pending 等用户点头。",
    { 入参: { task }, __code: "const v1 = await doPlan(task, 1);" },
  );
  const v1 = await doPlan(task, 1);
  logger.info(
    "调用函数-planOnly",
    "调用函数结束：planOnly",
    "为什么写这条日志：plan 已就位；下一步存 session，还不 invokeTool。",
    { 返回值: { version: v1.version, stepCount: v1.steps.length, fallback: v1.fallback }, 耗时ms: Date.now() - t0 },
  );
  return v1;
}
