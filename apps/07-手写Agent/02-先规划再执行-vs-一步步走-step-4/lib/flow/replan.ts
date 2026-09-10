/**
 * 职责：重规划检测（变体 C）—— 观察推翻原计划时才换清单。
 * 数据流：observations[] → { trigger, reason }。默认：query_stock 出现库存 0。
 * 为什么单独成文件：检测条件和执行循环正交。
 */

import type { Observation } from "../types.js";

export const MAX_PLAN_VERSIONS = 3;

export function shouldReplan(observations: Observation[]): { trigger: boolean; reason: string } {
  const stockResults = observations
    .filter((o) => o.tool === "query_stock")
    .map((o) => ({
      sku: String((o.args as { sku?: string })?.sku ?? ""),
      available: (o.result as { available?: number })?.available,
    }));

  if (stockResults.length === 0) return { trigger: false, reason: "" };

  const zeroSkus = stockResults.filter((s) => s.available === 0);
  if (zeroSkus.length > 0) {
    return {
      trigger: true,
      reason: `查询到 ${zeroSkus.length} 个 SKU 库存为 0（${zeroSkus.map((s) => s.sku).join(", ")}）—— 原计划「写文案 + 通知」假设所有 SKU 有货，需要重规划`,
    };
  }

  return { trigger: false, reason: "" };
}
