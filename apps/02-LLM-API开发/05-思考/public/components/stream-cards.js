/**
 * 职责：流式对照页的输出卡片 —— 官方开法 / 实测来源 / 思考区 / 正文 / 原始帧 / 错误。
 * 数据流：每一列 side（协议 A 或 B 的累积状态）→ ThinkingMap + StreamArea + JsonBlock。
 *
 * 颜色语义按 §5.3.10：
 *   用户输入 = 中性灰 bg-gray-50
 *   模型正文 = 绿系 bg-green-50 border-green-300
 *   思考过程 = 琥珀色（协议事件，不是终态）
 *   失败 = 红系 border-red-300 bg-red-50
 *
 * 挂载：window.DemoUI.{ SideColumn, ErrorBanner, PromptCard }
 */
(function () {
  window.DemoUI = window.DemoUI || {};

  var SOURCE_LABEL = {
    reasoning_details: "独立字段 · choices[0].delta.reasoning_details[].text",
    reasoning_content: "独立字段 · choices[0].delta.reasoning_content",
    content_think_tag: "嵌在正文 · choices[0].delta.content 里的 think 标记",
    "delta.thinking": "独立字段 · content_block_delta.delta.thinking",
  };

  var SHAPE_LABEL = {
    separate_field: "单独字段（不在正文 content/text 里）",
    in_content: "嵌在正文里（用 think 标记包住）",
    both: "这一轮两种都出现了",
    none: "这一轮没有收到思考增量",
  };

  function JsonBlock({ title, value }) {
    var text =
      value === null || value === undefined
        ? "（空）"
        : typeof value === "string"
          ? value
          : JSON.stringify(value, null, 2);
    return (
      <div className="space-y-1">
        <h3 className="text-sm font-medium">{title}</h3>
        <pre className="text-xs bg-gray-50 border rounded p-3 overflow-auto max-h-48 whitespace-pre-wrap break-all">
          {text}
        </pre>
      </div>
    );
  }

  /**
   * 思考区用琥珀色：它是协议事件（过程可观察量），不是给用户看的终态正文。
   * 正文区用绿系：拼起来的 content / text 才是终态。
   */
  function StreamArea({ title, text, hint, tone }) {
    var box =
      tone === "think"
        ? "bg-amber-50 border-amber-200 text-amber-950 italic"
        : "bg-green-50 border-green-300";
    return (
      <div className="space-y-1">
        <h3 className="text-sm font-medium">{title}</h3>
        <pre className={"text-sm border rounded p-3 min-h-[88px] whitespace-pre-wrap break-words " + box}>
          {text || hint}
        </pre>
      </div>
    );
  }

  /**
   * 「这一轮怎么开 · 从哪回来」：左边是官方方言（meta 帧），右边是这一轮 sources。
   * 判错会怎样：只看官方表会以为 MiniMax 一定走独立字段；国内站实测可能仍嵌在 content 里。
   */
  function ThinkingMap({ side }) {
    var explain = side.thinkingExplain;
    var sources = side.thinkingSources || [];
    var shape = side.returnShape ? SHAPE_LABEL[side.returnShape] || side.returnShape : "还在收帧 / 尚未判定";
    return (
      <div className="space-y-2 border border-indigo-100 bg-indigo-50 rounded p-3">
        <h3 className="text-sm font-medium">这一轮怎么开 · 从哪回来</h3>
        {side.skipped ? (
          <p className="text-sm text-amber-800">{side.skipReason || "按官方方言跳过了这次请求"}</p>
        ) : null}
        {explain ? (
          <ul className="text-xs space-y-1">
            <li>
              <span className="text-gray-500">开：</span>
              {explain.howEnabled}
            </li>
            <li>
              <span className="text-gray-500">关：</span>
              {explain.howDisabled}
            </li>
            <li>
              <span className="text-gray-500">官方字段：</span>
              {explain.returnField}
            </li>
            {explain.notes ? <li className="text-gray-600">{explain.notes}</li> : null}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">发出请求后，这里会写开启方式和返回位置。</p>
        )}
        <JsonBlock title="这次请求里真正打开 / 关闭思考的字段" value={side.switchSnippet} />
        {side.skipped ? null : (
          <p className="text-sm">
            <span className="text-xs text-gray-500 mr-2">这次实测</span>
            {shape}
          </p>
        )}
        {sources.length ? (
          <ul className="text-xs list-disc pl-5 space-y-1">
            {sources.map(function (s) {
              return <li key={s}>{SOURCE_LABEL[s] || s}</li>;
            })}
          </ul>
        ) : side.skipped ? null : (
          <p className="text-xs text-gray-500">
            还没有思考增量。若正文里也没有 {"<think>"} 标记，就是上游没把思考拆出来。
          </p>
        )}
      </div>
    );
  }

  /**
   * 一列 = 一家提供商的一套协议。协议 A 看 openai 流，协议 B 看 anthropic 流，不要混着读。
   */
  function SideColumn({ title, side }) {
    return (
      <div className="space-y-3">
        <h3 className="text-base font-semibold">{title}</h3>
        {side.sdk ? (
          <p className="text-xs text-gray-500">
            {side.sdk} · {side.method} · {side.model}
          </p>
        ) : null}
        {side.error ? (
          <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 whitespace-pre-wrap">
            {side.error}
          </div>
        ) : null}
        <ThinkingMap side={side} />
        <StreamArea title="思考（协议事件，不是终态）" text={side.thinking} hint="思考会流式写在这里" tone="think" />
        <StreamArea title="正文（给用户看的终态）" text={side.content} hint="回答会流式写在这里" tone="body" />
        <JsonBlock title="原始请求" value={side.request} />
        <JsonBlock title="原始响应帧" value={side.frames} />
      </div>
    );
  }

  /** 用户输入：中性灰，和模型输出区分开。 */
  function PromptCard({ label, value }) {
    return (
      <div className="rounded border border-gray-200 bg-gray-50 p-3">
        <div className="text-xs text-gray-500 mb-1">{label || "用户输入"}</div>
        <div className="text-sm text-gray-700 break-words">{value}</div>
      </div>
    );
  }

  /**
   * 失败横幅：面向人的一句话 + 原始信息。
   * httpStatus 有值 = 服务端明确拒绝（400 参数错）；没值 = fetch 根本没发出去。
   */
  function ErrorBanner({ title, detail, httpStatus }) {
    return (
      <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">{title}</span>
          <span className="text-xs text-gray-500">{httpStatus ? "HTTP " + httpStatus : "请求未送达"}</span>
        </div>
        <div className="text-xs break-words">{detail}</div>
      </div>
    );
  }

  window.DemoUI.SideColumn = SideColumn;
  window.DemoUI.ErrorBanner = ErrorBanner;
  window.DemoUI.PromptCard = PromptCard;
})();
