/**
 * 职责：内存里按 sessionId 存「已规划、未执行」的计划。确认前不 invokeTool。
 * 数据流：GET /api/plan 写入 → POST /api/confirm-plan 读出并删除。
 * 为什么单独成文件：会话状态和规划 / 执行循环正交，route 只调这一份 Map。
 */

import type { PlanStep } from "../types.js";

export type PendingSession = {
  task: string;
  initialSteps: PlanStep[];
  rawText: string;
  fallback: boolean;
};

export const sessions = new Map<string, PendingSession>();
