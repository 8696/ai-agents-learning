/**
 * 职责：POST /mcp —— MCP 协议端点，走 koa 路由（同进程同端口）。
 * 数据流：bodyParser 解析 JSON body → 先 checkBearer → 不通过 401（OAuth 2.1 形状）→ 通过才 transport.handleRequest
 *
 * 401 响应符合 OAuth 2.1：WWW-Authenticate 头 + error_description body。
 * error_description 字段是中文人话，方便 page 直接展示（不解析 header）。
 *
 * 关键：ctx.respond = false —— koa 默认会在 handler 返回后自己写 response，
 * 但 MCP 的 SSE 响应要一直写到 stream 结束。让 koa 别插手，由 transport 直接管整个响应。
 *
 * 为什么单独成文件：MCP 协议端点是这个 demo 的核心业务 URL（一个业务 URL 一个 route 文件）。
 * 鉴权放在 transport 之前才保证「401 在 JSON-RPC 之前」的语义。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { transport } from "../lib/flow/mcp-http-server.js";
import { checkBearer } from "../lib/flow/auth.js";
import { runWithUser } from "../lib/flow/request-context.js";

/**
 * 把 checkBearer 的 reason 翻译成 OAuth 2.1 标准的 error 值。
 * 教学用：reason 是我们内部标签；error 是 RFC 6749 §5.2 / RFC 6750 §3.1 的标准值。
 */
const REASON_TO_OAUTH_ERROR: Record<
  "missing" | "malformed" | "wrong" | "wrong_audience",
  string
> = {
  missing: "invalid_request",            // OAuth 2.1：请求缺必需参数
  malformed: "invalid_request",          // Authorization 头格式错（不在 Bearer scheme）
  wrong: "invalid_token",               // OAuth 2.1：token 无效 / 过期 / 撤销
  wrong_audience: "invalid_token",       // OAuth 2.1：token audience 不匹配（防 confused deputy）
};

export function mountMcpEndpoint(router: Router): void {
  router.post("/mcp", async (ctx: Context) => {
    // 让 koa 不要写自己的 response，由 transport / auth 自己写
    ctx.respond = false;

    // ── 第一关：HTTP 鉴权（管子上的身份）──
    // 不通过 → 直接 401，不进 transport / 不进 JSON-RPC
    const auth = checkBearer(ctx.req.headers);
    if (!auth.ok) {
      const oauthError = REASON_TO_OAUTH_ERROR[auth.reason];
      const body = JSON.stringify({
        ok: false,
        error: `HTTP 401 · ${oauthError}`,
        reason: auth.reason,
        // body 用完整中文人话，方便 page 直接展示
        error_description: auth.errorDescription,
      });
      // OAuth 2.1 §5.2 标准的 WWW-Authenticate：realm + error + error_description
      // HTTP header 只允许 ASCII；error_description 用 auth.errorDescriptionHeader（纯 ASCII）
      ctx.res.writeHead(401, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body, "utf8"),
        "WWW-Authenticate":
          `Bearer realm="mcp", ` +
          `error="${oauthError}", ` +
          `error_description="${auth.errorDescriptionHeader.replace(/"/g, "'")}"`,
      });
      ctx.res.end(body);
      return;
    }

    // ── 第二关：进 JSON-RPC（数据层）──
    // 用 AsyncLocalStorage 把 userId 传到 Tool / Resource / Prompt handler
    const body = ctx.request.body;
    try {
      await runWithUser(auth.userId, () => transport.handleRequest(ctx.req, ctx.res, body));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      // transport 已经写了部分响应（headers 已发），这里只是 console 兜底
      // eslint-disable-next-line no-console
      console.error("[mcp-endpoint] handleRequest 抛错：", message);
    }
  });
}