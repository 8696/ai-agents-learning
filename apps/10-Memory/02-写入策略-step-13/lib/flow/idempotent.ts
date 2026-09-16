/**
 * 职责：8-C 写入幂等 —— 同 idempotencyKey 重复请求只生效一次。
 *
 * 数据流：writeWithIdempotency({ userId, idempotencyKey, key, value, source, confidence })
 *   → getIdempotency(key) 查表
 *     → 命中（同 user + 同 key）：
 *         → request_hash 一致：返前次 response（isDuplicate=true）+ 不调 kvSet / 不写 audit_log / 不再插 idempotency_keys
 *         → request_hash 不一致：warning，按原 response 返（生产里通常 409）
 *     → 不命中：
 *         → recordAuditWrite(...) 写入库 + 记审计
 *         → recordIdempotency(... response 留底)
 *   → 返 { isDuplicate, audit, action, currentValue, response }
 *
 * 为什么单独成文件：本步核心的一部分（8-C 幂等 = 查表 + 留底，独立机制）。
 */
import crypto from "node:crypto";
import { recordAuditWrite } from "./audit-write.js";
import { getIdempotency, recordIdempotency } from "../store-idempotent.js";
import type { AuditAction, AuditRow } from "../store-audit.js";
import { logger } from "../logger.js";

export interface IdempotentWriteInput {
  userId: string;
  idempotencyKey: string;
  key: string;
  value: unknown;
  source: { sessionId: string; messageIndex: number };
  confidence: number;
}

export interface IdempotentWriteResult {
  isDuplicate: boolean;
  audit: AuditRow | null;
  action: AuditAction | null;
  currentValue: unknown | null;
  response: {
    auditId: number | null;
    isDuplicate: boolean;
    factKey: string;
    factValue: unknown | null;
  };
}

function hashRequest(input: { userId: string; key: string; value: unknown }): string {
  const h = crypto.createHash("sha256");
  h.update(input.userId);
  h.update("\n");
  h.update(input.key);
  h.update("\n");
  h.update(JSON.stringify(input.value));
  return h.digest("hex");
}

export async function writeWithIdempotency(input: IdempotentWriteInput): Promise<IdempotentWriteResult> {
  const t0 = Date.now();
  logger.info(
    "调用函数-writeWithIdempotency",
    "调用函数开始：writeWithIdempotency",
    `为什么写这条日志：8-C 写入幂等——同 idempotencyKey 重复请求只生效一次；网络重试 / 用户连点「写入」不会让库里多一条。当前：key = ${input.idempotencyKey}，userId = ${input.userId}。`,
    { 入参: input },
  );

  // 1. 查幂等
  const existing = getIdempotency(input.idempotencyKey);
  const requestHash = hashRequest({ userId: input.userId, key: input.key, value: input.value });

  if (existing) {
    if (existing.user_id !== input.userId) {
      logger.warn(
        "调用函数-writeWithIdempotency",
        "幂等键 user 冲突",
        "为什么写这条日志：idempotencyKey 是 user 隔离的；别的 user 用了同 key 当成自己的当下来，应当拒绝。",
        { existingUser: existing.user_id, requestUser: input.userId },
      );
      return {
        isDuplicate: true,
        audit: null, action: null, currentValue: null,
        response: { auditId: null, isDuplicate: true, factKey: "", factValue: null },
      };
    }
    if (existing.request_hash !== requestHash) {
      logger.warn(
        "调用函数-writeWithIdempotency",
        "幂等键 request 不一致",
        "为什么写这条日志：同 key 但请求体变了 — 这是客户端 bug 或并发冲突；按惯例返原 response 防止重复扣款 / 重复写入，但给个 warning。",
        { existingHash: existing.request_hash, requestHash },
      );
    }
    const resp = existing.response as { auditId: number | null; isDuplicate: boolean; factKey: string; factValue: unknown | null };
    logger.info(
      "调用函数-writeWithIdempotency",
      "调用函数结束：writeWithIdempotency（命中幂等）",
      `为什么写这条日志：同 key 同 user 重复请求；直接返前次 response，不调 kvSet / 不写 audit_log / 不进 idempotency_keys。当前：existing.audit_id = ${existing.audit_id}。`,
      { 返回值: { isDuplicate: true, response: resp }, 耗时ms: Date.now() - t0 },
    );
    return { isDuplicate: true, audit: null, action: null, currentValue: resp.factValue, response: { ...resp, isDuplicate: true } };
  }

  // 2. 第一次：真写 + 记审计
  const writeResult = await recordAuditWrite({
    userId: input.userId,
    key: input.key,
    value: input.value,
    source: input.source,
    confidence: input.confidence,
    idempotencyKey: input.idempotencyKey,
  });

  // 3. 幂等键留底
  const responseBody = { auditId: writeResult.audit.id, isDuplicate: false, factKey: writeResult.audit.key, factValue: writeResult.currentValue };
  recordIdempotency({
    key: input.idempotencyKey,
    user_id: input.userId,
    request_hash: requestHash,
    response: responseBody,
    audit_id: writeResult.audit.id,
  });

  const result: IdempotentWriteResult = {
    isDuplicate: false,
    audit: writeResult.audit,
    action: writeResult.action,
    currentValue: writeResult.currentValue,
    response: responseBody,
  };
  logger.info(
    "调用函数-writeWithIdempotency",
    "调用函数结束：writeWithIdempotency（首次写入）",
    `为什么写这条日志：路由层返给前端 success；幂等键表里多了一行供下次重复请求用。当前：action = ${writeResult.action}，audit_id = ${writeResult.audit.id}。`,
    { 返回值: result, 耗时ms: Date.now() - t0 },
  );
  return result;
}
