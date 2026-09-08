/**
 * 职责：Tool 定义 · create_order —— 创建订单（**幂等性演示** · 变体 2）。
 * 数据流：tool_use.input → Zod schema safeParse → handler(args) →
 *   1. 查 idempotency_cache（key 命中 → 直接返缓存的 order，不插 DB）
 *   2. 没命中 → 伪写 DB（ordersDb）+ 写 cache.set(key, order, TTL=24h)
 *   3. 返 { order, cacheHit, dbInserted }
 *
 * 教学锚点（覆盖本条 04 Tool Gateway · 变体 2）：
 *   - **重试 / 网络抖动 / 用户手抖重复点按钮 / 模型一次返回两个 create_order 并行** → 都不下重复单
 *   - **Idempotency-Key 必须是客户端生成**（同一意图同一 key；不同意图不同 key）
 *   - **服务端去重（自然幂等）** 也可：Tool 设计成 upsert_by_request_id
 *   - "Tool 名 + Zod 校验 + handler" 模式；本 Tool 不走 Gateway 三钩子（创建订单不危险）
 *
 * 日志（§5.3.16）：每次调用 + 缓存命中/未命中 + DB 插入都打。
 */
import { z } from "zod";
import { logger } from "../logger.js";

// ── 内存"DB"：演示用；生产用真实 DB（idempotency_key 唯一索引 + ON CONFLICT DO NOTHING）──
const ordersDb = new Map<string, OrderRecord>();
const idempotencyCache = new Map<string, { result: OrderRecord; expiresAt: number }>();
const TTL_MS = 24 * 3600 * 1000; // Stripe 默认 24h

export type OrderItem = { sku: string; qty: number };
export type OrderRecord = {
  order_id: string;
  items: OrderItem[];
  status: "created";
  created_at: string;
};

// ── 暴露给前端看（演示"DB 只插 1 行"）──
export function getOrderCount(): number {
  return ordersDb.size;
}
export function getCacheHits(): number {
  let n = 0;
  for (const v of idempotencyCache.values()) {
    if (v.expiresAt > Date.now()) n++;
  }
  return n;
}
export function listOrders(): OrderRecord[] {
  return [...ordersDb.values()];
}

export const createOrderTool = {
  name: "create_order",
  description:
    "创建一个订单。**强制要求 idempotency_key**（客户端生成 UUID v4；同一意图同一 key）。同一 key 重放返回相同 order_id，DB 只插 1 行；不同 key 创建不同订单。",
  schema: z.object({
    items: z
      .array(
        z.object({
          sku: z.string().trim().min(1, "sku 不能为空"),
          qty: z.coerce.number().int().positive("qty 必须是正整数"),
        }),
      )
      .min(1, "items 至少 1 个"),
    idempotency_key: z
      .string()
      .trim()
      .min(1, "idempotency_key 必填（客户端生成 UUID；同一意图同一 key）"),
  }),
  // 创建订单不危险；Registry 闸放过；Gateway 三钩子不挂这条 Tool
  dangerous: false,
  handler: (args: { items: OrderItem[]; idempotency_key: string }): {
    kind: "ok";
    payload: Record<string, unknown>;
    hookTrace: never[];
  } => {
    const key = args.idempotency_key;

    // ── 1. 查幂等 cache：命中直接返（**不插 DB**）──
    const cached = idempotencyCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      logger.info("create-order.cache-hit", "幂等命中", "同 idempotency_key 重放；返上次 order，不插 DB", {
        idempotency_key: key,
        order_id: cached.result.order_id,
        cacheSize: idempotencyCache.size,
        dbSize: ordersDb.size,
      });
      return {
        kind: "ok",
        payload: {
          order: cached.result,
          cacheHit: true,
          dbInserted: false,
          idempotency_key: key,
          dbSize: ordersDb.size,
          cacheSize: idempotencyCache.size,
        },
        hookTrace: [],
      };
    }

    // ── 2. 没命中：伪写 DB（生产用 INSERT ... ON CONFLICT DO NOTHING）──
    const orderId = `ord_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const order: OrderRecord = {
      order_id: orderId,
      items: args.items,
      status: "created",
      created_at: new Date().toISOString(),
    };
    ordersDb.set(orderId, order);
    idempotencyCache.set(key, { result: order, expiresAt: Date.now() + TTL_MS });
    logger.info("create-order.db-inserted", "插单成功", "新 order 入 DB；写幂等 cache（TTL=24h）", {
      idempotency_key: key,
      order_id: orderId,
      items: args.items,
      dbSize: ordersDb.size,
      cacheSize: idempotencyCache.size,
    });

    return {
      kind: "ok",
      payload: {
        order,
        cacheHit: false,
        dbInserted: true,
        idempotency_key: key,
        dbSize: ordersDb.size,
        cacheSize: idempotencyCache.size,
      },
      hookTrace: [],
    };
  },
};