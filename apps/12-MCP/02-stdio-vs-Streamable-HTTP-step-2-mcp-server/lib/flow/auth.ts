/**
 * 本步核心 · 鉴权子模块（HTTP API Token + 按用户映射）。
 *
 * 职责：
 *   - 把 Authorization 头解析成 userId + isGod
 *   - 给 route 层返回「401 / 放行 + userId」二态；放行后由 route 层用 runWithUser(userId, ...) 注入到 Tool handler
 *
 * 数据流：
 *   routes/mcp-endpoint.ts
 *     → checkBearer(ctx.req.headers)
 *       → 查 TOKEN_TO_USER 映射
 *     → { ok: false, reason } | { ok: true, reason: "ok", userId, isGod }
 *
 * 为什么单独成文件：鉴权判断 + token 来源 + userId 映射三件事合在一起；
 * 后面缺口 3（OAuth 2.1）只动 token→userId 这一段，route 不动。
 */
import type { IncomingHttpHeaders } from "node:http";
import { logger } from "../logger.js";

/**
 * token → userId 映射。教学 demo：clone 后即跑；生产必须改 env + 用 hash 比对。
 *
 * 三个角色：
 *   - alice-secret → alice（普通用户）
 *   - bob-secret   → bob（普通用户）
 *   - god-mode-token → god（上帝令牌 = 生产上的反例：能看到所有用户的工单）
 */
const TOKEN_TO_USER: Record<string, { userId: string; isGod: boolean }> = {
  "alice-secret": { userId: "alice", isGod: false },
  "bob-secret": { userId: "bob", isGod: false },
  "god-mode-token": { userId: "god", isGod: true },
};

/**
 * 给 page / server-info 用的「已知 token 预览」清单。
 * 不回传明文 token，只回前 4 字符 + 长度（教学用，避免页面上抄整串）。
 */
export function getKnownUsers(): Array<{
  tokenPreview: string;
  tokenLength: number;
  userId: string;
  isGod: boolean;
}> {
  return Object.entries(TOKEN_TO_USER).map(([token, info]) => ({
    tokenPreview: token.slice(0, 4) + "***",
    tokenLength: token.length,
    userId: info.userId,
    isGod: info.isGod,
  }));
}

export type CheckResult =
  | { ok: true; reason: "ok"; userId: string; isGod: boolean; tokenLength: number }
  | { ok: false; reason: "missing" | "malformed" | "wrong" };

/**
 * 校验 Authorization 头是否是 `Bearer <token>`，并把 token 解析成 userId。
 * 普通函数简写（§5.3.16）：五条日志仍要；函数体一句。
 */
export function checkBearer(headers: IncomingHttpHeaders): CheckResult {
  const t0 = Date.now();

  logger.info(
    "│ 调用函数-checkBearer",
    "调用函数开始：checkBearer",
    "为什么写这条日志：HTTP 鉴权是管子上的身份判断；放在 transport 前面才保证 JSON-RPC 还没开始。当前：mcp-endpoint 收到 POST /mcp 的第一条请求。",
    {
      入参: { hasAuthHeader: Boolean(headers.authorization) },
      __code: "const result = checkBearer(headers); if (!result.ok) ctx.res.writeHead(401, ...)",
    },
  );

  const raw = headers.authorization;
  if (!raw || typeof raw !== "string") {
    const result: CheckResult = { ok: false, reason: "missing" };
    logger.info(
      "│ 调用函数-checkBearer",
      "调用函数结束：checkBearer（失败）",
      "为什么写这条日志：route 要在收到缺头的请求时返 401，不让 transport 处理。当前：Authorization 头不存在。",
      { 返回值: result, 耗时ms: Date.now() - t0 },
    );
    return result;
  }

  const match = /^Bearer\s+(\S+)\s*$/i.exec(raw);
  if (!match) {
    const result: CheckResult = { ok: false, reason: "malformed" };
    logger.info(
      "│ 调用函数-checkBearer",
      "调用函数结束：checkBearer（失败）",
      "为什么写这条日志：route 要在头格式不对时返 401，不让 transport 处理。当前：Authorization 头不是「Bearer <token>」形状。",
      { 返回值: result, 耗时ms: Date.now() - t0 },
    );
    return result;
  }

  const presented = match[1];
  const mapped = TOKEN_TO_USER[presented];
  if (!mapped) {
    const result: CheckResult = { ok: false, reason: "wrong" };
    logger.info(
      "│ 调用函数-checkBearer",
      "调用函数结束：checkBearer（失败）",
      "为什么写这条日志：route 要在 token 不在 TOKEN_TO_USER 表里时返 401，不让 transport 处理。当前：presented token 查不到对应 userId。",
      { 返回值: result, 耗时ms: Date.now() - t0 },
    );
    return result;
  }

  const result: CheckResult = {
    ok: true,
    reason: "ok",
    userId: mapped.userId,
    isGod: mapped.isGod,
    tokenLength: presented.length,
  };
  logger.info(
    "│ 调用函数-checkBearer",
    "调用函数结束：checkBearer",
    "为什么写这条日志：route 看到 ok 就把请求交给 transport.handleRequest，并在 AsyncLocalStorage 里塞 userId。当前：token 映射成功，下一步进 McpServer。",
    { 返回值: result, 耗时ms: Date.now() - t0 },
  );
  return result;
}
