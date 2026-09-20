/**
 * 职责：本 demo 的远端 MCP 响应输出卡（按 Tools / Resources 模块拆）。
 *       - ToolsCard / ToolCallCard / MyTicketsCard：tools/list · tools/call(make_latte) · tools/call(list_my_tickets) 三张轨迹卡
 *       - ResourcesCard / ResourceReadCard：resources/list · resources/read(menu://today) 两张轨迹卡
 *       - 父组件负责所有 useState 与 fetch 回调；本组件只按 props 渲染；无数据时返回 null
 *
 * 为什么单独成文件：index.html 单页硬约束 ≤ 400 行；五张卡的 JSX 全堆进去会到 455 行（超 55）。
 * Prompts 拆 prompts.js、OAuth 拆 oauth-section.js，本文件同模式承接剩余轨迹卡。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  function callerLabel(currentUserKey) {
    return currentUserKey ?? "未识别";
  }

  DemoUI.ToolsCard = function ToolsCard(props) {
    const tools = props.tools;
    if (!tools) return null;
    return (
      <div className="bg-green-50 border border-green-300 rounded p-3 space-y-1">
        <div className="text-xs font-semibold text-green-900">
          远端 MCP 响应 · tools/list · 调用方 <code>{callerLabel(props.currentUserKey)}</code> · 耗时 {tools.elapsedMs} ms
        </div>
        <pre className="text-xs whitespace-pre-wrap max-h-48 overflow-auto">
          {JSON.stringify(tools.tools, null, 2)}
        </pre>
      </div>
    );
  };

  DemoUI.ToolCallCard = function ToolCallCard(props) {
    const r = props.toolCallResult;
    if (!r) return null;
    return (
      <div className="bg-green-50 border border-green-300 rounded p-3 space-y-1">
        <div className="text-xs font-semibold text-green-900">
          远端 MCP 响应 · tools/call(make_latte) · 调用方 <code>{callerLabel(props.currentUserKey)}</code> · 耗时 {r.elapsedMs} ms
        </div>
        <pre className="text-xs whitespace-pre-wrap max-h-48 overflow-auto">
          {JSON.stringify(r.result, null, 2)}
        </pre>
      </div>
    );
  };

  DemoUI.MyTicketsCard = function MyTicketsCard(props) {
    const t = props.myTickets;
    if (!t) return null;
    return (
      <div className={
        "rounded p-3 space-y-1 border " +
        (t.isGod ? "bg-red-50 border-red-400" : "bg-green-50 border-green-300")
      }>
        <div className="text-xs font-semibold text-gray-900">
          {t.isGod ? "⚠" : "✅"} tools/call(list_my_tickets) ·{" "}
          服务端 viewerUserId=<code>{t.viewerUserId}</code> ·{" "}
          看到 <code>{t.tickets.length}</code> 张工单 · 耗时 {t.elapsedMs} ms
        </div>
        {t.isGod ? (
          <div className="text-xs text-red-800 font-semibold">
            ⚠ 反例：上帝令牌绕过 userId 过滤，能看到所有用户的工单。
          </div>
        ) : null}
        <pre className="text-xs whitespace-pre-wrap max-h-48 overflow-auto bg-white border border-gray-200 rounded p-2">
          {JSON.stringify(t.tickets, null, 2)}
        </pre>
      </div>
    );
  };

  DemoUI.ResourcesCard = function ResourcesCard(props) {
    const r = props.resources;
    if (!r) return null;
    return (
      <div className="bg-green-50 border border-green-300 rounded p-3 space-y-1">
        <div className="text-xs font-semibold text-green-900">
          远端 MCP 响应 · resources/list · 调用方 <code>{callerLabel(props.currentUserKey)}</code> · 耗时 {r.elapsedMs} ms
        </div>
        <pre className="text-xs whitespace-pre-wrap max-h-48 overflow-auto">
          {JSON.stringify(r.resources, null, 2)}
        </pre>
      </div>
    );
  };

  DemoUI.ResourceReadCard = function ResourceReadCard(props) {
    const r = props.resourceRead;
    if (!r) return null;
    return (
      <div className="bg-green-50 border border-green-300 rounded p-3 space-y-1">
        <div className="text-xs font-semibold text-green-900">
          远端 MCP 响应 · resources/read(menu://today) · 调用方 <code>{callerLabel(props.currentUserKey)}</code> · 耗时 {r.elapsedMs} ms
        </div>
        <pre className="text-xs whitespace-pre-wrap max-h-48 overflow-auto">
          {JSON.stringify(r.result, null, 2)}
        </pre>
      </div>
    );
  };
})();