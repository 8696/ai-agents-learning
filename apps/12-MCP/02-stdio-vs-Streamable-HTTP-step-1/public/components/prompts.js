/**
 * 职责：本 demo 的 Prompt（提示词模板）相关 UI 子组件。
 *       - PromptsSection：按钮 + 输入框 + 输出卡 一整块
 *       - 父组件负责所有 useState 与 fetch 回调，本组件只接收 props 渲染
 *
 * 为什么单独成文件：index.html 加 4 个按钮 + 2 张卡超 400 行硬约束，拆到这里。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  DemoUI.PromptsSection = function PromptsSection(props) {
    const prompts = props.prompts;
    const promptGet = props.promptGet;
    const customerName = props.customerName;
    const busy = props.busy;
    const onListPromptsClick = props.onListPromptsClick;
    const onGetGreetingClick = props.onGetGreetingClick;
    const onGetRefundClick = props.onGetRefundClick;
    const onCustomerNameChange = props.onCustomerNameChange;

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <button
            id="btn-list-prompts"
            onClick={onListPromptsClick}
            disabled={busy}
            className="border border-gray-300 px-3 py-1 rounded text-sm disabled:opacity-50"
            title="走 JSON-RPC prompts/list"
          >
            看预设话术模板（prompts/list）
          </button>
          <button
            id="btn-get-greeting"
            onClick={onGetGreetingClick}
            disabled={busy || !customerName}
            className="bg-blue-600 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
            title="走 JSON-RPC prompts/get(customer_service_greeting)"
          >
            取客服开场白（带 customerName）
          </button>
          <button
            id="btn-get-refund"
            onClick={onGetRefundClick}
            disabled={busy}
            className="border border-gray-300 px-3 py-1 rounded text-sm disabled:opacity-50"
            title="走 JSON-RPC prompts/get(refund_response)"
          >
            取退款话术模板
          </button>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="customerName">客户称呼：</label>
          <input
            id="customerName"
            value={customerName}
            onChange={(e) => onCustomerNameChange(e.target.value)}
            className="border border-gray-300 px-2 py-1 rounded text-sm"
          />
        </div>

        {prompts && (
          <div className="bg-blue-50 border border-blue-300 rounded p-3 space-y-1">
            <div className="text-xs font-semibold text-blue-900">
              MCP 协议响应 · prompts/list · 耗时 {prompts.elapsedMs} ms
            </div>
            <pre className="text-xs whitespace-pre-wrap max-h-48 overflow-auto">
              {JSON.stringify(prompts.prompts, null, 2)}
            </pre>
            <div className="text-xs text-gray-600">
              提示词模板 = 预设话术；用户/宿主用 prompts/get 按参数拼出实际文本。
            </div>
          </div>
        )}

        {promptGet && (
          <div className="bg-green-50 border border-green-300 rounded p-3 space-y-1">
            <div className="text-xs font-semibold text-green-900">
              MCP 协议响应 · prompts/get · {promptGet.label} · 耗时 {promptGet.elapsedMs} ms
            </div>
            {promptGet.error ? (
              <div className="text-xs text-red-700">
                错误：<code>{promptGet.error}</code>
              </div>
            ) : (
              <pre className="text-xs whitespace-pre-wrap max-h-48 overflow-auto">
                {JSON.stringify(promptGet.result, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    );
  };
})();