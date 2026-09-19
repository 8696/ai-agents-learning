/**
 * 本步核心 · 鉴权子模块（HTTP API Token + 按用户映射 + OAuth 2.1 audience 校验）。
 *
 * 职责：
 *   - 把 Authorization 头解析成 userId + isGod + 校验 token 的 audience
 *   - 给 route 层返回「401 / 放行 + userId + isGod」；放行后由 route 层用 runWithUser 注入到 Tool handler
 *   - 401 响应符合 OAuth 2.1 形状（WWW-Authenticate 头 + error_description body）
 *
 * 数据流：
 *   routes/mcp-endpoint.ts
 *     → checkBearer(ctx.req.headers)
 *       → 查 TOKEN_TO_USER 映射 → 校验 audience
 *     → { ok: false, reason, errorDescription } | { ok: true, userId, isGod }
 *
 * 为什么单独成文件：鉴权判断 + token 来源 + userId 映射 + audience 校验四件事合在一起；
 * 后续 OAuth 2.1 完整接入（真授权服务器）只动 token→userId 这一段，route 不动。
 */
import type { IncomingHttpHeaders } from "node:http";
import { logger } from "../logger.js";

/**
 * 这个 MCP 服务端的「realm / audience」标识。
 * OAuth 2.1 资源服务器（RFC 8707 / RFC 9728）：所有 token 必须在 audience 字段
 * 标这个值，服务端才接受。
 */
const SERVER_AUDIENCE = "mcp";

/**
 * token → userId + audience 映射。教学 demo：clone 后即跑；生产必须改 env + 用 hash 比对。
 *
 * 四个角色：
 *   - alice-secret → alice（普通用户，给 "mcp" 用）
 *   - bob-secret   → bob（普通用户，给 "mcp" 用）
 *   - god-mode-token → god（上帝令牌 = 生产上的反例：能看到所有用户的工单，给 "mcp" 用）
 *   - token-for-other-server → userId=null（audience 是 "other-mcp"，这把令牌是发给别的 MCP 服务端的）
 */
const TOKEN_TO_USER: Record<string, {
  userId: string | null;
  isGod: boolean;
  audience: string;
}> = {
  "alice-secret": { userId: "alice", isGod: false, audience: SERVER_AUDIENCE },
  "bob-secret": { userId: "bob", isGod: false, audience: SERVER_AUDIENCE },
  "god-mode-token": { userId: "god", isGod: true, audience: SERVER_AUDIENCE },
  "token-for-other-server": { userId: null, isGod: false, audience: "other-mcp" },
};

/**
 * 给 page / server-info 用的「已知 token 预览」清单。
 * 不回传明文 token，只回前 4 字符 + 长度（教学用，避免页面上抄整串）。
 */
export function getKnownUsers(): Array<{
  tokenPreview: string;
  tokenLength: number;
  userId: string | null;
  isGod: boolean;
  audience: string;
}> {
  return Object.entries(TOKEN_TO_USER).map(([token, info]) => ({
    tokenPreview: token.slice(0, 4) + "***",
    tokenLength: token.length,
    userId: info.userId,
    isGod: info.isGod,
    audience: info.audience,
  }));
}

/** 受众不匹配时返回的 401 error_description —— OAuth 2.1 防「confused deputy」 */
const AUDIENCE_MISMATCH_DESCRIPTION =
  `audience mismatch: this token was issued for 'other-mcp', not '${SERVER_AUDIENCE}'`;

/**
 * HTTP header 只允许 ASCII；error_description 中文版只放 body。
 * WWW-Authenticate header 用 ASCII 短描述。
 */
const REASON_TO_HEADER_DESCRIPTION: Record<
  "missing" | "malformed" | "wrong" | "wrong_audience",
  string
> = {
  missing: "missing Authorization header",
  malformed: "Authorization header is not in 'Bearer <token>' format",
  wrong: "token does not match any known credential",
  wrong_audience: AUDIENCE_MISMATCH_DESCRIPTION,
};

export type CheckResult =
  | { ok: true; reason: "ok"; userId: string; isGod: boolean; tokenLength: number }
  | {
      ok: false;
      reason: "missing" | "malformed" | "wrong" | "wrong_audience";
      errorDescription: string;       // 完整中文人话 → body 用
      errorDescriptionHeader: string; // 纯 ASCII 短描述 → WWW-Authenticate header 用
    };

/**
 * 校验 Authorization 头是否是 `Bearer <token>`，并把 token 解析成 userId + audience 校验。
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
    const reason = "missing" as const;
    const errorDescription = "请求头里没有 Authorization —— OAuth 2.1 客户端必须在每次请求里带 Bearer token";
    const errorDescriptionHeader = REASON_TO_HEADER_DESCRIPTION[reason];
    const result: CheckResult = { ok: false, reason, errorDescription, errorDescriptionHeader };
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
    const reason = "malformed" as const;
    const errorDescription = "Authorization 头不是「Bearer <token>」形状——OAuth 2.1 标准格式是 Bearer scheme";
    const errorDescriptionHeader = REASON_TO_HEADER_DESCRIPTION[reason];
    const result: CheckResult = { ok: false, reason, errorDescription, errorDescriptionHeader };
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
    const reason = "wrong" as const;
    const errorDescription = "token 不在已知列表里——OAuth 2.1 客户端应该从授权服务器拿有效 token";
    const errorDescriptionHeader = REASON_TO_HEADER_DESCRIPTION[reason];
    const result: CheckResult = { ok: false, reason, errorDescription, errorDescriptionHeader };
    logger.info(
      "│ 调用函数-checkBearer",
      "调用函数结束：checkBearer（失败）",
      "为什么写这条日志：route 要在 token 不在 TOKEN_TO_USER 表里时返 401，不让 transport 处理。当前：presented token 查不到对应记录。",
      { 返回值: result, 耗时ms: Date.now() - t0 },
    );
    return result;
  }

  // OAuth 2.1 受众校验：token 找到了但 audience 不是本服务端 → confused deputy 防御
  if (mapped.audience !== SERVER_AUDIENCE) {
    const reason = "wrong_audience" as const;
    const result: CheckResult = {
      ok: false,
      reason,
      errorDescription: AUDIENCE_MISMATCH_DESCRIPTION,
      errorDescriptionHeader: REASON_TO_HEADER_DESCRIPTION[reason],
    };
    logger.info(
      "│ 调用函数-checkBearer",
      "调用函数结束：checkBearer（失败）",
      "为什么写这条日志：OAuth 2.1 防「confused deputy」——token 是发给别的 MCP 服务端的，不能拿到本服务端用。当前：token audience 不匹配。",
      { 返回值: result, 耗时ms: Date.now() - t0 },
    );
    return result;
  }

  // audience 匹配的 token 里如果 userId 是 null（理论上不应该出现）→ 兜底
  if (!mapped.userId) {
    const reason = "wrong" as const;
    const errorDescription = "token audience 对了但没映射到任何 userId——服务端配置异常";
    const errorDescriptionHeader = REASON_TO_HEADER_DESCRIPTION[reason];
    const result: CheckResult = { ok: false, reason, errorDescription, errorDescriptionHeader };
    logger.info(
      "│ 调用函数-checkBearer",
      "调用函数结束：checkBearer（失败）",
      "为什么写这条日志：兜底——理论上不该发生。当前：audience 对了但 userId 是 null。",
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
    "为什么写这条日志：route 看到 ok 就把请求交给 transport.handleRequest，并在 AsyncLocalStorage 里塞 userId。当前：token audience 对了、userId 映射成功，下一步进 McpServer。",
    { 返回值: result, 耗时ms: Date.now() - t0 },
  );
  return result;
}

/** 暴露给 server-info / page 用：本服务端的 audience 标识 */
export const SERVER_REALM = SERVER_AUDIENCE;