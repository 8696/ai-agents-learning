/**
 * 职责：GET /api/capacity —— 读取当前阈值 + 完整容量状态。
 * 数据流：GET /api/capacity → checkCapacity("default") → CapacityState
 *
 * 完整状态（含 currentChars / factCount / scatterCount / exceeded / scatterKeys）让 auto-merge sub-page
 * 不用本地算「未归档 + 非对话原文的字符数」——这个算法在后端保持唯一真理。
 *
 * 设置阈值的 POST /api/capacity/config 在 routes/capacity-config.ts（§5.3.8 一路由一文件）。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { checkCapacity } from "../lib/flow/capacity-merge.js";
import { logger } from "../lib/logger.js";

export function mountCapacityGetRoutes(router: Router): void {
  router.get("/api/capacity", async (ctx: Context) => {
    const state = await checkCapacity("default");
    logger.info(
      "调用函数-capacity-get-route",
      "调用函数结束：GET /api/capacity",
      `为什么写这条日志：让前端 slider 一加载就知道当前阈值是几 + 库当前字符数 / 是否超限，不写死默认。当前：阈值 = ${state.threshold ?? "不限"}，库字符 = ${state.currentChars}，超限 = ${state.exceeded}。`,
      { 返回值: { threshold: state.threshold, currentChars: state.currentChars, scatterCount: state.scatterCount, exceeded: state.exceeded }, 字段释义: {
        "threshold": "当前阈值；null = 不限",
        "currentChars": "未归档 + 非对话原文的事实总字符数",
        "scatterCount": "未归档且非对话原文的事实条数",
        "exceeded": "true = 已超限，下次写入会触发自动合并",
      } },
    );
    ctx.body = state;
  });
}