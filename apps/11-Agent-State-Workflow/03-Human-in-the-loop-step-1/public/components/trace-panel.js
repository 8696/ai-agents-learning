/**
 * 职责：请求参数 / 调用流程 / 响应结果三块。对照协议里这一次 HTTP 走了什么。
 * 数据流：App 传入 lastCall（method / url / request / response / httpStatus）。
 * 为什么单独成文件：输出区三件要可区分，不堆进内联块。
 */
window.DemoUI = window.DemoUI || {};

function TracePanel(props) {
  const lastCall = props.lastCall;
  if (!lastCall) {
    return (
      <div className="text-xs text-gray-500">
        还没有发过业务请求。点「发起转账提议」后，这里会出现请求参数、调用流程、响应结果。
      </div>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <div className="bg-gray-50 rounded p-3 space-y-1">
        <div className="text-xs font-semibold text-gray-700">请求参数</div>
        <p className="text-xs text-gray-500">
          {lastCall.method} {lastCall.url}
        </p>
        <pre className="whitespace-pre-wrap text-xs text-gray-700 max-h-32 overflow-auto">
          {JSON.stringify(lastCall.request, null, 2)}
        </pre>
      </div>
      <div className="border border-gray-300 bg-white rounded p-3 space-y-1">
        <div className="text-xs font-semibold text-gray-700">调用流程</div>
        <ol className="text-xs text-gray-600 list-decimal pl-4 space-y-1">
          <li>页面发出上面这条请求。</li>
          <li>路由校验入参，再调 lib/flow/pause-before-side-effect.ts。</li>
          <li>
            {lastCall.url === "/api/propose"
              ? "提议路径：写入 pending，不调用 executeTransfer。"
              : lastCall.url === "/api/approve"
                ? "通过路径：核对 runId 后才调用 executeTransfer，用的是 pending.args 当前那份。"
                : lastCall.url === "/api/reject"
                  ? "拒绝路径：核对 runId 后只把 pending.status 改成 rejected；executeTransfer 一次都不进。"
                  : lastCall.url === "/api/edit"
                    ? "改参数路径：核对 runId 后只改 pending.args；status 仍是 waiting、executeTransfer 不进（改参数 ≠ 批准）。"
                    : lastCall.url === "/api/read"
                      ? "只读路径：getBalanceCallCount +1；不写 pending，不进等待节点，不调 executeTransfer。"
                      : "其它路径：不走转账主流程。"}
          </li>
        </ol>
      </div>
      <div
        className={
          lastCall.httpStatus >= 400
            ? "border border-red-300 bg-red-50 rounded p-3 space-y-1"
            : "border border-green-300 bg-green-50 rounded p-3 space-y-1"
        }
      >
        <div className="text-xs font-semibold text-gray-700">
          响应结果 · HTTP {lastCall.httpStatus}
        </div>
        <pre className="whitespace-pre-wrap text-xs text-gray-700 max-h-32 overflow-auto">
          {JSON.stringify(lastCall.response, null, 2)}
        </pre>
      </div>
    </div>
  );
}

window.DemoUI.TracePanel = TracePanel;
