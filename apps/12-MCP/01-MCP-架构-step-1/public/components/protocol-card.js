/**
 * 职责：一张协议卡。只放请求、两边各做了什么、响应。
 * 数据流：exchange 返回值 → 三块。
 */
(function () {
  const DemoUI = window.DemoUI || {};

  function ProtocolCard(props) {
    const card = props.card;
    const ok = card.protocolOk;
    const respCls = ok ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50";
    return (
      <article className="border rounded p-3 space-y-2 bg-white">
        <div className="text-sm font-semibold">
          方法名（method）：<span className="font-mono">{card.jsonrpcRequest.method}</span>
          <span className={"ml-2 text-xs px-2 py-0.5 rounded " + (ok ? "bg-green-200" : "bg-red-200")}>
            {ok ? "成功" : "失败"}
          </span>
        </div>
        <p className="text-xs text-gray-700">点咖啡小程序：{card.agentDid}</p>
        <p className="text-xs text-gray-700">吧台：{card.serverDid}</p>
        <div className="bg-gray-50 rounded p-2">
          <div className="text-xs font-semibold mb-1">请求参数</div>
          <pre className="whitespace-pre-wrap text-xs max-h-40 overflow-auto">
            {JSON.stringify(card.jsonrpcRequest, null, 2)}
          </pre>
        </div>
        <div className={"border rounded p-2 " + respCls}>
          <div className="text-xs font-semibold mb-1">响应结果</div>
          <pre className="whitespace-pre-wrap text-xs max-h-48 overflow-auto">
            {JSON.stringify(card.jsonrpcResponse, null, 2)}
          </pre>
        </div>
      </article>
    );
  }

  DemoUI.ProtocolCard = ProtocolCard;
  window.DemoUI = DemoUI;
})();
