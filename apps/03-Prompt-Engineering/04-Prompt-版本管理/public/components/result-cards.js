/**
 * 职责：输出区卡片 —— 一版 Prompt 的长度 / 推理标记 / 原文。
 *
 * 颜色按 §5.3.10：请求参数灰、模型终态绿、含推理是中性协议事件（黄徽标）、上游失败红。
 *
 * 挂载：window.DemoUI.{ VersionCard, CompareResult, ErrorBanner }
 */
(function () {
  window.DemoUI = window.DemoUI || {};

  function VersionCard({ title, row, suffix }) {
    if (!row) {
      return (
        <div className="rounded border border-gray-300 bg-white p-3">
          <h3 className="text-sm font-semibold mb-2">{title}</h3>
          <p className="text-sm text-gray-400">尚未跑这一版</p>
        </div>
      );
    }
    if (row.ok === false) {
      return (
        <div className="rounded border border-red-300 bg-red-50 p-3 space-y-1">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-gray-500">上游失败 HTTP {row.status}</p>
          <pre className="whitespace-pre-wrap text-xs max-h-32 overflow-auto">{row.error}</pre>
        </div>
      );
    }
    return (
      <div className="rounded border border-green-300 bg-green-50 p-3 space-y-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-gray-600 whitespace-pre-wrap break-words">User 末尾：{suffix}</p>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-2 py-0.5 rounded bg-white">长度 {row.textLen}</span>
          <span
            className={
              "px-2 py-0.5 rounded " +
              (row.hasReasoning ? "bg-amber-100 text-amber-900" : "bg-white")
            }
          >
            含推理：{row.hasReasoning ? "是" : "否"}
          </span>
        </div>
        <p className="text-xs text-gray-500">首段：{row.preview || "（空）"}</p>
        <pre className="whitespace-pre-wrap text-xs bg-white/70 p-2 rounded border max-h-32 overflow-auto">
          {row.raw || "（空回复）"}
        </pre>
      </div>
    );
  }

  function CompareResult({ data, fallbackSuffixes }) {
    var v1Row = data.results
      ? data.results.find(function (r) {
          return r.mode === "v1";
        })
      : null;
    var v2Row = data.results
      ? data.results.find(function (r) {
          return r.mode === "v2";
        })
      : null;
    var v1Ok = v1Row && v1Row.ok === true ? v1Row : null;
    var v2Ok = v2Row && v2Row.ok === true ? v2Row : null;
    var lengthDelta = v1Ok && v2Ok ? v2Ok.textLen - v1Ok.textLen : null;
    var v1Suffix =
      (data.versions && data.versions.v1 && data.versions.v1.suffix) ||
      (fallbackSuffixes && fallbackSuffixes.v1) ||
      "";
    var v2Suffix =
      (data.versions && data.versions.v2 && data.versions.v2.suffix) ||
      (fallbackSuffixes && fallbackSuffixes.v2) ||
      "";

    return (
      <div className="space-y-3">
        <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
          <div className="text-xs text-gray-500 mb-1">请求参数（同一道题）</div>
          prompt: {data.input}
        </div>
        {lengthDelta !== null && (
          <div className="text-sm bg-amber-50 border border-amber-200 rounded p-2">
            v1.0.0 长度 {v1Ok.textLen}，v1.1.0 长度 {v2Ok.textLen}，一字之差带来{" "}
            <strong>
              {lengthDelta >= 0 ? "+" : ""}
              {lengthDelta}
            </strong>{" "}
            字符的差距。
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <VersionCard title="v1.0.0（不含 step by step）" row={v1Row} suffix={v1Suffix} />
          <VersionCard title="v1.1.0（加一句 step by step）" row={v2Row} suffix={v2Suffix} />
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

  window.DemoUI.VersionCard = VersionCard;
  window.DemoUI.CompareResult = CompareResult;
  window.DemoUI.ErrorBanner = ErrorBanner;
})();
