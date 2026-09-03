/**
 * 职责：输出区卡片 —— 一侧 shot 的判定（formatValid / hadThinking / parsed）。
 *
 * 颜色按 §5.3.10：用户输入灰、模型终态绿、格式失败红、含思考块是中性协议事件。
 * 思考块已在服务端剥掉；卡片同时展示「嘴边原文」和「剥完后 Zod 能否吃进去」。
 *
 * 挂载：window.DemoUI.{ ShotCard, CompareResult, ErrorBanner }
 */
(function () {
  window.DemoUI = window.DemoUI || {};

  /** 一侧 shot 一张卡。row.ok=false 是上游失败，不是格式不合法。 */
  function ShotCard({ title, row }) {
    if (!row) {
      return (
        <div className="rounded border border-gray-300 bg-white p-3">
          <h3 className="text-sm font-semibold mb-2">{title}</h3>
          <p className="text-sm text-gray-400">尚未跑这一侧</p>
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
    var box = row.formatValid
      ? "border-green-300 bg-green-50"
      : "border-red-300 bg-red-50";
    return (
      <div className={"rounded border p-3 space-y-2 " + box}>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-sm">
          去掉思考块后格式合法：{" "}
          <strong>{row.formatValid ? "是" : "否"}</strong>
        </p>
        <p className="text-xs text-gray-600">
          {row.hadThinking
            ? "原文含思考块，网关已剥离后再 parse（模型嘴边仍不是纯 JSON）。"
            : "原文无思考块。"}
        </p>
        {row.parsed ? (
          <p className="text-sm">
            标签 <code>{row.parsed.label}</code> · 原因 {row.parsed.reason}
          </p>
        ) : (
          <p className="text-sm text-red-700">
            剥离后仍不是 label+reason。{row.formatError}
          </p>
        )}
        <pre className="whitespace-pre-wrap text-xs bg-white/70 p-2 rounded border max-h-32 overflow-auto">
          {row.raw || "（空回复）"}
        </pre>
      </div>
    );
  }

  function CompareResult({ data }) {
    var zeroRow = data.results
      ? data.results.find(function (r) {
          return r.mode === "zero";
        })
      : null;
    var fewRow = data.results
      ? data.results.find(function (r) {
          return r.mode === "few";
        })
      : null;
    return (
      <div className="space-y-3">
        <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
          <div className="text-xs text-gray-500 mb-1">请求参数（同一句评价）</div>
          prompt: {data.input}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ShotCard title="Zero-shot · k=0" row={zeroRow} />
          <ShotCard title="Few-shot · k=4（写法 B 假对话）" row={fewRow} />
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

  window.DemoUI.ShotCard = ShotCard;
  window.DemoUI.CompareResult = CompareResult;
  window.DemoUI.ErrorBanner = ErrorBanner;
})();
