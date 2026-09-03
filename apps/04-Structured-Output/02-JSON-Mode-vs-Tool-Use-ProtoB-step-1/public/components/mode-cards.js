/**
 * 职责：输出区卡片 —— 一次协议 B 调用的 raw / parsed / analysis / tool_use 徽标。
 *
 * 颜色按 §5.3.10：prompt 灰底；模型 raw 绿底；协议事件（Zod / fence / tool_use）用徽标。
 * tool_use 块出现时显示 name + id 前缀——这就是「写在哪」和协议 A content 字符串的差别。
 *
 * 挂载：window.DemoUI.{ ModeCard, ErrorBanner, CaseResult }
 */
(function () {
  window.DemoUI = window.DemoUI || {};

  function ModeCard({ label, payload }) {
    if (!payload) return null;
    if (!payload.ok) {
      return (
        <div className="border border-red-300 bg-red-50 rounded p-3 text-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="font-semibold text-red-700">{label}</span>
            <span className="text-xs text-gray-500">HTTP {payload.status}</span>
          </div>
          <pre className="whitespace-pre-wrap text-xs text-red-600 max-h-32 overflow-auto">
            {String(payload.error)}
          </pre>
        </div>
      );
    }
    var b = payload.body;
    var analysis = b.analysis || {};
    var tags = [];
    if (analysis.parseOk) {
      tags.push(
        <span key="zod-ok" className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-800">
          Zod ✓
        </span>,
      );
    } else {
      tags.push(
        <span key="zod-bad" className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-800">
          Zod ✗
        </span>,
      );
    }
    if (analysis.hasMarkdownFence) {
      tags.push(
        <span key="fence" className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-800">
          夹 fence
        </span>,
      );
    }
    if (analysis.hasThinkTag) {
      tags.push(
        <span key="think" className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800">
          夹 {"<think>"}
        </span>,
      );
    }
    if ((analysis.missingKeys || []).length > 0) {
      tags.push(
        <span key="miss" className="text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-800">
          缺 {(analysis.missingKeys || []).join(",")}
        </span>,
      );
    }
    if ((analysis.extraKeys || []).length > 0) {
      tags.push(
        <span key="extra" className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-800">
          多 {(analysis.extraKeys || []).join(",")}
        </span>,
      );
    }
    var toolId = b.toolUse && b.toolUse.id ? String(b.toolUse.id).slice(0, 8) : "";
    return (
      <div className="border border-gray-300 rounded p-3 text-sm space-y-2 bg-white">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">{label}</span>
          <span className="flex gap-1 flex-wrap justify-end">{tags}</span>
        </div>
        <div className="text-xs text-gray-500">
          看到 keys：{(analysis.keysSeen || []).join(", ") || "(无)"} · raw 长{" "}
          {analysis.rawLength || 0} · {b.elapsedMs || "?"}ms
          {b.toolUse && (
            <span className="ml-2 text-blue-700">
              tool_use {b.toolUse.name} #{toolId}…
            </span>
          )}
        </div>
        <div className="rounded border border-green-300 bg-green-50 p-2">
          <div className="text-xs text-green-800 mb-1">
            raw（text 路径是模型吐的文本；tool-use 路径是 input 对象的 JSON）
          </div>
          <pre className="whitespace-pre-wrap text-xs max-h-40 overflow-auto">
            {String(b.raw || "(空)")}
          </pre>
        </div>
        <div className="rounded border border-gray-300 bg-gray-50 p-2">
          <div className="text-xs text-gray-500 mb-1">parsed（Zod 校验后）</div>
          <pre className="whitespace-pre-wrap text-xs max-h-32 overflow-auto">
            {analysis.parseOk
              ? JSON.stringify(b.parsed, null, 2)
              : String(b.parseError || "(无法解析)")}
          </pre>
        </div>
      </div>
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

  function CaseResult({ entry, label }) {
    return (
      <div className="border-t pt-4 space-y-2">
        <div className="font-semibold text-sm">{entry.title}</div>
        <div className="rounded border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700">
          <span className="text-gray-500">prompt: </span>
          {entry.prompt}
        </div>
        {entry.expect && <div className="text-xs italic text-gray-500">{entry.expect}</div>}
        <ModeCard label={label} payload={entry.payload} />
      </div>
    );
  }

  window.DemoUI.ModeCard = ModeCard;
  window.DemoUI.ErrorBanner = ErrorBanner;
  window.DemoUI.CaseResult = CaseResult;
})();
