/**
 * 职责：输出区卡片 —— 一次调用的账单（usage 三兄弟 + 分项费用）和错误横幅。
 *
 * 数据流：BillingMeasurement → BillingCard；HTTP 失败 → ErrorBanner。
 * 颜色：用户输入灰、模型回复绿、费用数字是本条要盯的系统事件。
 *
 * 挂载：window.DemoUI.{ BillingCard, ErrorBanner, PricingTable }
 */
(function () {
  window.DemoUI = window.DemoUI || {};

  /** 示例单价表：数字来自 GET /health 的 pricing，页面不写死。 */
  function PricingTable({ pricing }) {
    if (!pricing) {
      return <p className="text-xs text-gray-500">单价还没从 /health 拿到。</p>;
    }
    return (
      <div className="text-xs text-gray-600 space-y-1">
        <div>
          输入 {pricing.inputPerMillion} 元 / 百万 Token · 输出 {pricing.outputPerMillion} 元 /
          百万 Token（示例，输出是输入的 {pricing.outputPerMillion / pricing.inputPerMillion} 倍）
        </div>
        <div className="text-gray-500">{pricing.note}</div>
      </div>
    );
  }

  /**
   * 一张账单 = 一次真实调用。
   * prompt_tokens 按输入单价、completion_tokens 按输出单价——这就是「为什么账单要分两栏」。
   */
  function BillingCard({ measurement, expect }) {
    var u = measurement.usage;
    var c = measurement.cost;
    return (
      <div className="rounded border border-gray-200 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">{measurement.label}</span>
          <span className="text-xs text-gray-500">
            {measurement.durationMs} ms · finish_reason={measurement.finishReason || "?"}
          </span>
        </div>
        {expect && <p className="text-xs text-gray-500">{expect}</p>}

        <div className="rounded border border-gray-200 bg-gray-50 p-2 text-sm text-gray-700">
          <span className="text-xs text-gray-500">prompt · max_tokens={measurement.maxTokens}</span>
          <pre className="whitespace-pre-wrap break-words text-xs max-h-24 overflow-auto mt-1">
            {measurement.prompt}
          </pre>
        </div>

        <div className="rounded border border-green-300 bg-green-50 p-2">
          <div className="text-xs text-green-800 mb-1">模型回复（终态，非流式）</div>
          <pre className="whitespace-pre-wrap break-words text-sm max-h-32 overflow-auto">
            {measurement.reply || "（空）"}
          </pre>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
          <div className="rounded border border-gray-300 bg-white p-2">
            <div className="text-xs text-gray-500">prompt_tokens（输入）</div>
            <div className="font-mono font-semibold">{u.prompt_tokens}</div>
            <div className="text-xs text-gray-500">¥ {c.inputCny}</div>
          </div>
          <div className="rounded border border-amber-300 bg-amber-50 p-2">
            <div className="text-xs text-amber-800">completion_tokens（输出，更贵）</div>
            <div className="font-mono font-semibold">{u.completion_tokens}</div>
            <div className="text-xs text-gray-500">¥ {c.outputCny}</div>
          </div>
          <div className="rounded border border-green-300 bg-green-50 p-2">
            <div className="text-xs text-green-800">total_tokens / 合计</div>
            <div className="font-mono font-semibold">{u.total_tokens}</div>
            <div className="text-xs text-gray-500">
              ¥ {c.totalCny} · 输出占比 {c.outputSharePercent}%
            </div>
          </div>
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

  window.DemoUI.PricingTable = PricingTable;
  window.DemoUI.BillingCard = BillingCard;
  window.DemoUI.ErrorBanner = ErrorBanner;
})();
