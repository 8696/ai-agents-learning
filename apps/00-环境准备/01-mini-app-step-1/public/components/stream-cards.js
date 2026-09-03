/**
 * 职责：输出区卡片 —— 请求参数、模型终态答案、Token 用量、SSE 原始帧、错误横幅。
 *
 * 数据流：
 *   页面 state（prompt / content / usage / frames / error）→ 本文件的组件 → #output 里的卡片
 *
 * 颜色语义按 §5.3.10 固定，两个场景页共用：
 *   用户输入 = 中性灰 bg-gray-50；模型终态 = 绿系 bg-green-50 border-green-300；
 *   协议事件 = 成功绿 / 失败红 / 中性白。
 *
 * 为什么单独成文件：chat.html 与 frames.html 看的是同一条流的两个侧面，
 * 卡片各写一份迟早会「同一个字段两页颜色不一样」。
 *
 * 挂载：window.DemoUI.{ PromptCard, AnswerCard, UsageBar, FrameCard, ErrorBanner }
 */
(function () {
  window.DemoUI = window.DemoUI || {};

  /**
   * 一帧对应协议里的哪个字段 —— 这张表就是 frames 页的主要教学内容。
   * label 是徽标文字，hint 说明这一帧在协议里代表什么，cls 决定卡片颜色（§5.3.10）。
   */
  var FRAME_KIND = {
    delta: {
      label: "delta",
      hint: "choices[0].delta.content：本帧新增的正文片段，不是完整回复",
      cls: "border-gray-300 bg-white",
      badge: "bg-gray-200 text-gray-700",
    },
    meta: {
      label: "meta",
      hint: "只有元信息的帧（首帧的 role、空 delta 等），正文为空",
      cls: "border-gray-300 bg-white",
      badge: "bg-gray-200 text-gray-700",
    },
    finish: {
      label: "finish_reason",
      hint: "生成为什么停：stop = 说完了，length = 撞到 max_tokens",
      cls: "border-green-300 bg-green-50",
      badge: "bg-green-200 text-green-800",
    },
    usage: {
      label: "usage",
      hint: "Token 用量，多数网关只在最后一帧给（要 stream_options.include_usage）",
      cls: "border-green-300 bg-green-50",
      badge: "bg-green-200 text-green-800",
    },
    done: {
      label: "[DONE]",
      hint: "结束哨兵，注意它不是 JSON：解析前必须先判断这个字符串",
      cls: "border-green-300 bg-green-50",
      badge: "bg-green-200 text-green-800",
    },
    error: {
      label: "error",
      hint: "服务端塞进流里的错误帧：响应头早就发了 200，改不了状态码，只能这样报错",
      cls: "border-red-300 bg-red-50",
      badge: "bg-red-200 text-red-800",
    },
    unparsed: {
      label: "无法解析",
      hint: "这一帧不是合法 JSON，也不是 [DONE]：多半是中间层塞了别的东西进来",
      cls: "border-red-300 bg-red-50",
      badge: "bg-red-200 text-red-800",
    },
  };

  /** 用户输入 / 请求参数：中性灰，和模型输出区分开，方便回看「当时问的是什么」。 */
  function PromptCard({ prompt }) {
    return (
      <div className="rounded border border-gray-200 bg-gray-50 p-3">
        <div className="text-xs text-gray-500 mb-1">请求参数 · POST /api/chat</div>
        <div className="text-sm text-gray-700 break-words">
          <span className="font-mono">message:</span> {prompt}
        </div>
      </div>
    );
  }

  /** 模型输出：绿系强调 = 给用户看的终态。streaming 为真时说明还在逐帧追加。 */
  function AnswerCard({ text, streaming }) {
    return (
      <div className="rounded border border-green-300 bg-green-50 p-3">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs text-green-800">
            模型回复（由每帧 delta.content 拼起来）
          </div>
          {streaming ? <div className="text-xs text-gray-500">逐帧追加中…</div> : null}
        </div>
        <pre className="whitespace-pre-wrap break-words text-sm max-h-64 overflow-auto">
          {text || "（还没有内容）"}
        </pre>
      </div>
    );
  }

  /**
   * 元信息条：帧数 / Token 用量 / 耗时。
   * 没拿到 usage 不是 bug —— 有的网关不在流里给，只能去控制台看账单，这一点要写在页面上。
   */
  function UsageBar({ usage, frameCount, elapsedMs, doneSeen }) {
    return (
      <div className="text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
        <span>帧数 {frameCount}</span>
        <span>耗时 {elapsedMs} ms</span>
        <span>结束帧 {doneSeen ? "收到 [DONE]" : "未收到"}</span>
        {usage ? (
          <span>
            token prompt={usage.prompt_tokens} completion={usage.completion_tokens} total=
            {usage.total_tokens}
          </span>
        ) : (
          <span>usage：本次流里没给，去当前提供商控制台查</span>
        )}
      </div>
    );
  }

  /** 一帧一张卡：左边徽标说明它是协议里的哪一步，下面是原样 JSON（限高，避免撑破页面）。 */
  function FrameCard({ frame }) {
    var kind = FRAME_KIND[frame.kind] || FRAME_KIND.meta;
    return (
      <div className={"rounded border p-3 space-y-1 " + kind.cls}>
        <div className="flex items-center justify-between gap-2">
          <span className={"text-xs px-2 py-0.5 rounded " + kind.badge}>{kind.label}</span>
          <span className="text-xs text-gray-500">第 {frame.index} 帧</span>
        </div>
        <div className="text-xs text-gray-600">{kind.hint}</div>
        <pre className="whitespace-pre-wrap break-all text-xs max-h-32 overflow-auto bg-white/70 rounded p-2">
          {frame.payload}
        </pre>
      </div>
    );
  }

  /**
   * 失败横幅：面向人的一句话 + 原始信息。
   * httpStatus 有值 = 服务端明确拒绝（400 参数错 / 503 没 Key）；
   * 没值 = fetch 根本没发出去（服务没起、网络断）。两种要能一眼分开。
   */
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

  window.DemoUI.PromptCard = PromptCard;
  window.DemoUI.AnswerCard = AnswerCard;
  window.DemoUI.UsageBar = UsageBar;
  window.DemoUI.FrameCard = FrameCard;
  window.DemoUI.ErrorBanner = ErrorBanner;
})();
