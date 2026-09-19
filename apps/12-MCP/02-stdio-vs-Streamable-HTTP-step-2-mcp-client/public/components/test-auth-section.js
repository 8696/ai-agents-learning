/**
 * 职责：本 demo 的「无 token / 错 token → 401」演示。
 *       - TestAuthSection：两个按钮 + 结果渲染
 *       - 自管 state：组件内部 useState 管 lastResult；App 端只传 busy 一个 prop
 *
 * 为什么单独成文件：index.html 加这两个按钮就超 400 行硬约束，拆到这里。
 *
 * 教学点对照：
 *   - HTTP 401 = 鉴权失败发生在 transport.handleRequest 之前
 *   - 区分 missing / malformed / wrong 三种 reason → 三种 error_description
 *   - WWW-Authenticate header 形状按 OAuth 2.1 §5.2 标准
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  DemoUI.TestAuthSection = function TestAuthSection(props) {
    const busy = props.busy;
    const lastResult = props.lastResult;
    const onTestNoToken = props.onTestNoToken;
    const onTestWrongToken = props.onTestWrongToken;

    return (
      <div className="space-y-2 border-t pt-3 mt-2">
        <div className="text-sm font-semibold text-gray-700">
          401 触发演示（API Token 鉴权 · A5）
        </div>

        <div className="text-xs text-gray-600">
          服务端 <code>routes/mcp-endpoint.ts</code> 在 <code>transport.handleRequest</code> 之前先 <code>checkBearer</code>；
          下面两个按钮触发的请求分别是「无 Authorization 头」和「错 token」——服务端都会返 401 + WWW-Authenticate，
          body 里有中文 <code>error_description</code>，header 里是 OAuth 2.1 §5.2 标准形状。
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            id="btn-test-no-token"
            disabled={busy}
            onClick={onTestNoToken}
            title="不发 Authorization 头，调用 /api/http/list-tools → 服务端 reason='missing' → 401"
            className="border border-gray-300 bg-white px-3 py-1 rounded text-sm disabled:opacity-50"
          >
            无 token 试一次（不发 Authorization 头）
          </button>
          <button
            id="btn-test-wrong-token"
            disabled={busy}
            onClick={onTestWrongToken}
            title="用 wrong-token-demo（服务端 TOKEN_TO_USER 查不到）→ reason='wrong' → 401"
            className="border border-gray-300 bg-white px-3 py-1 rounded text-sm disabled:opacity-50"
          >
            错 token 试一次（wrong-token-demo）
          </button>
        </div>

        {lastResult && (
          <div
            className={
              "rounded p-3 space-y-1 border " +
              (lastResult.ok ? "bg-green-50 border-green-300" : "bg-red-50 border-red-400")
            }
            id="card-test-auth-result"
          >
            <div className="text-xs font-semibold text-gray-900">
              {lastResult.ok ? "✅" : "❌"} tools/list · HTTP {lastResult.httpStatus} ·{" "}
              reason=<code>{lastResult.reason ?? "(无)"}</code> · 耗时 {lastResult.elapsedMs} ms
            </div>

            {!lastResult.ok && (
              <>
                <div className="text-xs text-gray-700">body 里的 <code>error_description</code>（中文）：</div>
                <pre className="text-xs whitespace-pre-wrap max-h-32 overflow-auto bg-white border border-gray-200 rounded p-2">
                  {JSON.stringify(lastResult.body, null, 2)}
                </pre>
                <div className="text-xs text-gray-700">
                  服务端 <code>WWW-Authenticate</code> header（OAuth 2.1 §5.2 形状，英文）：
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