/**
 * 职责：对照卡片 —— 一侧协议结果 / 判定徽标 / 剥思考后的正文 / 错误横幅。
 * 数据流：CaseResponse.a|b → SidePanel；HTTP 失败 → ErrorBanner。
 *
 * 颜色（§5.3.10）：
 *   用户输入灰；模型终态绿；判定 SYSTEM_WIN/REMEMBERED 绿、USER_WIN/FORGOT 红、PARTIAL 琥珀。
 *
 * 挂载：window.DemoUI.{ SidePanel, ComparePair, PromptBlock, ErrorBanner }
 */
(function () {
  window.DemoUI = window.DemoUI || {};

  var THINK_CLOSE = "<" + "/think>";

  function verdictClass(v) {
    if (v === "SYSTEM_WIN" || v === "REMEMBERED") return "bg-green-100 text-green-800";
    if (v === "USER_WIN" || v === "FORGOT") return "bg-red-100 text-red-800";
    if (v === "PARTIAL") return "bg-amber-100 text-amber-800";
    return "bg-gray-200 text-gray-700";
  }

  /**
   * 判定徽标：对应服务端 verdict 字段，不是页面自己猜的。
   * 绿 = 按教学预期赢了；红 = 没听 System / 失忆；琥珀 = 妥协。
   */
  function VerdictPill({ verdict, label }) {
    return (
      <span className={"text-xs px-2 py-0.5 rounded " + verdictClass(verdict)}>
        {label || verdict}
      </span>
    );
  }

  /**
   * 协议 A 常把思考嵌进 content。灰斜体那段就是「还没剥之前」的污染，
   * 用来解释为什么 strict JSON 在 A 上经常看起来不像 JSON。
   */
  function renderTextWithThink(text) {
    if (!text) return <span className="text-gray-400">（空）</span>;
    var parts = [];
    var rest = text;
    var key = 0;
    var idx;
    while ((idx = rest.indexOf(THINK_CLOSE)) !== -1) {
      var chunk = rest.slice(0, idx + THINK_CLOSE.length);
      parts.push(
        <span key={key++} className="italic text-gray-500">
          {chunk}
        </span>
      );
      rest = rest.slice(idx + THINK_CLOSE.length);
    }
    if (rest) parts.push(<span key={key++}>{rest}</span>);
    return (
      <pre className="whitespace-pre-wrap break-words text-sm max-h-32 overflow-auto">{parts}</pre>
    );
  }

  /**
   * 一侧结果 = 协议 A 或 B 的一次调用。
   * error 有值：这一侧上游炸了，对面那侧仍可能成功（allSettled）。
   */
  function SidePanel({ side }) {
    if (!side) {
      return <p className="text-xs text-gray-500">还没有这一侧的结果。</p>;
    }
    if (side.error) {
      return (
        <div className="border border-red-300 bg-red-50 rounded p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">协议 {side.protocol}</span>
            <VerdictPill verdict="FORGOT" label="⚠️ 请求失败" />
          </div>
          <pre className="whitespace-pre-wrap text-xs text-red-700 max-h-32 overflow-auto">
            {side.error}
          </pre>
        </div>
      );
    }
    var cleanedDiffers = side.text !== side.cleanedText;
    var thinkLabel = "<" + "think>";
    return (
      <div className="border border-green-300 bg-green-50 rounded p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold">协议 {side.protocol} · 模型输出</span>
          <VerdictPill verdict={side.verdict} label={side.verdictLabel} />
        </div>
        {renderTextWithThink(side.text)}
        <details className="text-xs text-gray-600">
          <summary className="cursor-pointer">
            剥掉 {thinkLabel} 后{" "}
            {cleanedDiffers
              ? "（少了 " + (side.text.length - side.cleanedText.length) + " 字符）"
              : "（无变化）"}
          </summary>
          <pre className="mt-1 bg-white border border-gray-200 rounded p-2 whitespace-pre-wrap break-words max-h-32 overflow-auto">
            {side.cleanedText || "（空）"}
          </pre>
        </details>
        <div className="text-xs text-gray-500">
          usage in:{side.usage && side.usage.input} + out:{side.usage && side.usage.output} ·{" "}
          {side.durationMs} ms
        </div>
      </div>
    );
  }

  /** 并排两列：同一份 prompt，协议 A 左、协议 B 右。 */
  function ComparePair({ a, b }) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SidePanel side={a} />
        <SidePanel side={b} />
      </div>
    );
  }

  /**
   * 发出去的 system / turns。灰色 = 用户输入 / 请求参数，和下面绿色模型输出区分开。
   */
  function PromptBlock({ system, turns }) {
    return (
      <div className="space-y-2 text-sm">
        {system ? (
          <div className="bg-gray-50 border border-gray-200 rounded p-2">
            <div className="text-xs text-gray-500 mb-1">system（协议 A 进 messages[]，协议 B 走顶层）</div>
            <pre className="whitespace-pre-wrap break-words text-xs text-gray-700 max-h-24 overflow-auto">
              {system}
            </pre>
          </div>
        ) : (
          <p className="text-xs text-gray-500">本 case 不传 system。</p>
        )}
        <div className="bg-gray-50 border border-gray-200 rounded p-2">
          <div className="text-xs text-gray-500 mb-1">turns（messages 数组，user / assistant）</div>
          <pre className="whitespace-pre-wrap break-words text-xs text-gray-700 max-h-32 overflow-auto">
            {JSON.stringify(turns, null, 2)}
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

  window.DemoUI.SidePanel = SidePanel;
  window.DemoUI.ComparePair = ComparePair;
  window.DemoUI.PromptBlock = PromptBlock;
  window.DemoUI.ErrorBanner = ErrorBanner;
  window.DemoUI.VerdictPill = VerdictPill;
})();
