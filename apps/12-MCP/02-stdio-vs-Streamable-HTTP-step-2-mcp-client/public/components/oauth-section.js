/**
 * 职责：本 demo 的 OAuth 2.1 概念卡 + audience 不匹配演示。
 *       - OauthSection：顶部角色图文字 + 演示按钮 + 结果渲染
 *       - 父组件负责所有 useState 与 fetch 回调，本组件只接收 props 渲染
 *
 * 为什么单独成文件：index.html 加 OAuth 角色图 + 演示按钮 + 结果渲染会超 400 行硬约束；拆到这里。
 *
 * 教学点对照：
 *   - 角色图：用户 → 授权服务器 → MCP Client → MCP Server（Resource Server），访问令牌流向
 *   - audience 校验：token 上写的 aud 必须等于服务端 realm，否则 401 + WWW-Authenticate
 *   - demo：用「发给别的 MCP server 的 token」（token-for-other-server）演示 audience 不匹配
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  // ── 一个示例 token，专门演示「发给别的 MCP server 的 token 拿到我们的端点」 ──
  const CROSS_SERVER_TOKEN = "token-for-other-server";

  DemoUI.OauthSection = function OauthSection(props) {
    const busy = props.busy;
    const lastResult = props.lastResult;
    const onTestAudience = props.onTestAudience;

    return (
      <div className="space-y-3 border-t pt-3 mt-2">
        <div className="text-sm font-semibold text-gray-700">
          OAuth 2.1 角色图 + Audience 受众校验
        </div>

        {/* 角色图：ASCII */}
        <pre className="text-xs bg-gray-50 border border-gray-300 rounded p-3 overflow-x-auto">
{`  用户（Resource Owner）                  授权服务器（Authorization Server）
       │                                              │
       │ 点「连接工单系统」                            │ 颁发 access token
       ▼                                              ▼
  ┌──────────────────────────────────────────────────────┐
  │ access token（含 aud=工单系统-mcp）                  │
  └──────────────────────────────────────────────────────┘
       │ 每次 HTTP POST 放进 Authorization: Bearer ...
       ▼
  MCP Client（Co-pilot / Cursor / 自己的 Agent）
       │ 转发带 Authorization 的请求
       ▼
  MCP Server（Resource Server，aud=mcp） ← 本 server
       │ ① checkBearer：解析 Bearer
       │ ② audience 校验：token.aud 必须等于本 server 的 realm
       │ ③ audience 不匹配 → 401 + WWW-Authenticate
       │ ③ audience 匹配 → runWithUser(userId) → Tool handler 强制按 userId 过滤
       ▼
  list_my_tickets / make_latte / resources / prompts`}
        </pre>

        <div className="text-xs text-gray-600">
          <b>Audience（受众）</b>= 访问令牌上写的「这把令牌是发给哪个资源服务器的」。
          生产 OAuth 2.1 里 token 通常是 JWT（带 <code>aud</code> 字段），
          Resource Server 收到 token 时 <b>必须</b> 校验 <code>aud == 本 server 的 realm</code>，
          否则其他 server 的 token 拿来用就成「confused deputy」——这是 OAuth 2.1 防混淆代理的核心机制。
        </div>

        {/* 演示按钮 */}
        <div className="flex flex-wrap gap-2">
          <button
            id="btn-oauth-mismatch"
            disabled={busy}
            onClick={function () { onTestAudience(CROSS_SERVER_TOKEN); }}
            title={"用 token-for-other-server（audience=other-mcp）发起 list-tools 请求 → 服务端 audience 不匹配 → 401 + WWW-Authenticate 描述原因"}
            className="border border-red-400 bg-red-50 text-red-800 px-3 py-1 rounded text-sm disabled:opacity-50"
          >
            用「发给别的 MCP server 的 token」试一次
          </button>
        </div>

        {/* 结果渲染：401 红 / 200 绿 + error_description + WWW-Authenticate 形状 */}
        {lastResult && (
          <div
            className={
              "rounded p-3 space-y-1 border " +
              (lastResult.ok ? "bg-green-50 border-green-300" : "bg-red-50 border-red-400")
            }
            id="card-oauth-result"
          >
            <div className="text-xs font-semibold text-gray-900">
              {lastResult.ok ? "✅" : "❌"} tools/list · HTTP {lastResult.httpStatus} ·{" "}
              reason=<code>{lastResult.reason || "(ok)"}</code> · 耗时 {lastResult.elapsedMs} ms
            </div>

            {lastResult.ok ? (
              <pre className="text-xs whitespace-pre-wrap max-h-40 overflow-auto bg-white border border-gray-200 rounded p-2">
                {JSON.stringify(lastResult.result, null, 2)}
              </pre>
            ) : (
              <>
                <div className="text-xs text-gray-700">
                  服务端返的 body（page 直接读 error_description，不需要解析 header）：
                </div>
                <pre className="text-xs whitespace-pre-wrap max-h-32 overflow-auto bg-white border border-gray-200 rounded p-2">
                  {JSON.stringify(lastResult.body, null, 2)}
                </pre>

                <div className="text-xs text-gray-700">
                  服务端写的 <code>WWW-Authenticate</code> header（OAuth 2.1 标准形状）：
                </div>
                <pre className="text-xs whitespace-pre-wrap max-h-24 overflow-auto bg-white border border-gray-200 rounded p-2">
                  {lastResult.wwwAuthenticate || "(无)"}
                </pre>
              </>
            )}
          </div>
        )}
      </div>
    );
  };
})();