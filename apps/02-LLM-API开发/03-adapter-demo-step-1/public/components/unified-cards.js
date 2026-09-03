/**
 * 职责：输出区卡片 —— UnifiedResponse / UnifiedDelta 日志 / 错误横幅。
 * 颜色：思考灰、正文绿、usage 为系统事件。
 * 挂载：window.DemoUI.{ UnifiedCard, StreamLog, ErrorBanner, ProtocolForm }
 */
(function () {
  window.DemoUI = window.DemoUI || {};

  function usageLines(u) {
    if (!u) return "（无 usage）";
    var lines = [
      "inputTokens = " + u.inputTokens,
      "outputTokens = " + u.outputTokens,
      "totalTokens = " + u.totalTokens,
    ];
    if (u.thinkingTokens != null) {
      lines.push("thinkingTokens = " + u.thinkingTokens + "（adapter 从三处字段位置统一提取）");
    }
    if (u.cachedTokens != null) lines.push("cachedTokens = " + u.cachedTokens);
    return lines.join("\n");
  }

  function UnifiedCard({ data }) {
    if (!data) return null;
    return (
      <div className="space-y-2">
        <div className="rounded border border-gray-200 bg-gray-50 p-3">
          <div className="text-xs text-gray-500 mb-1">thinking（协议事件，已从 A 的标记 / B 的 block 翻过来）</div>
          <pre className="whitespace-pre-wrap break-words text-sm max-h-32 overflow-auto">
            {data.thinking || "（无）"}
          </pre>
        </div>
        <div className="rounded border border-green-300 bg-green-50 p-3">
          <div className="text-xs text-green-800 mb-1">content（终态正文）</div>
          <pre className="whitespace-pre-wrap break-words text-sm max-h-48 overflow-auto">
            {data.content || "（空）"}
          </pre>
        </div>
        <div className="rounded border border-gray-300 bg-white p-3 text-xs text-gray-600">
          <div>
            protocol={data.protocol} · model={data.model} · stopReason={data.stopReason}
          </div>
          <pre className="whitespace-pre-wrap mt-1">{usageLines(data.usage)}</pre>
        </div>
      </div>
    );
  }

  function StreamLog({ lines }) {
    return (
      <pre className="whitespace-pre-wrap break-words text-xs max-h-48 overflow-auto bg-gray-50 p-2 rounded border border-gray-200">
        {lines || "（还没有 delta）"}
      </pre>
    );
  }

  function ErrorBanner({ title, detail, httpStatus }) {
    return (
      <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">{title}</span>
          <span className="text-xs text-gray-500">
            {httpStatus ? "HTTP " + httpStatus : "请求未送达"}
          </span>
        </div>
        <div className="text-xs break-words">{detail}</div>
      </div>
    );
  }

  window.DemoUI.UnifiedCard = UnifiedCard;
  window.DemoUI.StreamLog = StreamLog;
  window.DemoUI.ErrorBanner = ErrorBanner;
  window.DemoUI.usageLines = usageLines;
})();
