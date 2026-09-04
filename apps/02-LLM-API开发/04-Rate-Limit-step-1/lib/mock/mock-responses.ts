/**
 * 职责：本机 mock LLM 的 5 个确定性端点 + 1 个「掐连接」端点的响应形状。
 * 数据流：pathname → { status, headers, body }；retry 层通过 HTTP 再打回来，不直接调这个函数。
 * 为什么单独成文件：mock 状态机（easy 计数器 / chaos 随机）不属于 HTTP 装配，也不属于 retry 算法。
 *
 * 日志（§5.3.16）：mock 不是 LLM 但教学上替代 LLM——记每次返回的 status / headers 便于和 retry.decide 时间线对得上。
 */
import type { Context } from "koa";
import { logger } from "../logger.js";

/** 五个教学场景 + drop（给 retry 看见 status=network）。 */
export const MOCK_TARGETS = ["easy", "chaos", "auth", "forever", "ok", "drop"] as const;
export type MockTarget = (typeof MOCK_TARGETS)[number];

export function isMockTarget(s: string): s is MockTarget {
  return (MOCK_TARGETS as readonly string[]).includes(s);
}

/** /api/easy 的"还差几次就 200"计数器（per-process） */
const easyRemainingFailures = { count: 2 };

/** 每次走 proxy 的 easy 都从 2 次 429 开始，否则 CLI 跑完后页面再点会直接 200。 */
export function resetEasyFailures(): void {
  easyRemainingFailures.count = 2;
}

/** /api/chaos 的简单随机：30% 429 / 20% 500 / 50% 200 */
function chaosRoll(): { status: number; retryAfter?: string } {
  const r = Math.random();
  if (r < 0.3) return { status: 429, retryAfter: "0.3" };
  if (r < 0.5) return { status: 500 };
  return { status: 200 };
}

/** 直接路径（不走 retry）：返回 mock LLM 行为，让 retry 套在外面 */
export function handleDirect(path: string): {
  status: number;
  headers: Record<string, string>;
  body: string;
} {
  const out = handleDirectInner(path);
  logger.debug("mock.respond", `${path} 返回 ${out.status}`, "mock 替代 LLM 给 retry 吃；记 status + retry-after 让 retry.decide 时间线能追到这一刀", {
    path,
    status: out.status,
    retryAfter: out.headers["retry-after"] ?? null,
    bodyPreview: out.body.slice(0, 120),
  });
  return out;
}

/** handleDirect 的纯函数实现，便于 logger 包裹外层时单独测。 */
function handleDirectInner(path: string): {
  status: number;
  headers: Record<string, string>;
  body: string;
} {
  switch (path) {
    case "/api/easy": {
      if (easyRemainingFailures.count > 0) {
        easyRemainingFailures.count -= 1;
        return {
          status: 429,
          headers: { "retry-after": "0.5", "content-type": "application/json" },
          body: JSON.stringify({ error: "rate_limit_exceeded", message: "请 0.5 秒后再试（mock）" }),
        };
      }
      return {
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "chatcmpl-easy",
          content: "你好，我是 mock LLM（easy）",
          usage: { prompt_tokens: 10, completion_tokens: 8 },
        }),
      };
    }
    case "/api/chaos": {
      const roll = chaosRoll();
      if (roll.status === 200) {
        return {
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: "chatcmpl-chaos-ok",
            content: "ok（mock）",
            usage: { prompt_tokens: 5, completion_tokens: 3 },
          }),
        };
      }
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (roll.retryAfter) headers["retry-after"] = roll.retryAfter;
      return {
        status: roll.status,
        headers,
        body: JSON.stringify({
          error: roll.status === 429 ? "rate_limit_exceeded" : "internal_error",
          message: `mock ${roll.status}`,
        }),
      };
    }
    case "/api/auth":
      return {
        status: 401,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "invalid_api_key", message: "Incorrect API key provided" }),
      };
    case "/api/forever":
      return {
        status: 429,
        headers: { "retry-after": "0.3", "content-type": "application/json" },
        body: JSON.stringify({ error: "rate_limit_exceeded", message: "永久 429（mock）" }),
      };
    case "/api/ok":
      return {
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "chatcmpl-ok",
          content: "直接成功（mock）",
          usage: { prompt_tokens: 5, completion_tokens: 3 },
        }),
      };
    default:
      return {
        status: 404,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "not_found" }),
      };
  }
}

/** 把 handleDirect 的结果写到 koa ctx（直接路径，不套 retry）。 */
export function applyDirect(ctx: Context, pathname: string): void {
  const direct = handleDirect(pathname);
  ctx.status = direct.status;
  for (const [k, v] of Object.entries(direct.headers)) {
    ctx.set(k, v);
  }
  try {
    ctx.body = JSON.parse(direct.body) as unknown;
  } catch {
    ctx.body = direct.body;
  }
}
