/**
 * 职责：输出区卡片 —— 请求参数、模型增量、abort 协议事件、usage、错误横幅。
 *
 * 数据流：
 *   页面 state（prompt / content / aborted / usage / error）→ 本文件的组件 → #output 里的卡片
 *
 * 颜色语义按 §5.3.10 固定，三个场景页共用：
 *   用户输入 = 中性灰 bg-gray-50；模型终态 = 绿系 bg-green-50 border-green-300；
 *   协议事件 = 成功绿 / 失败红 / 中性白。abort 是「流被掐断」的协议事件，用红底。
 *
 * 为什么单独成文件：full / cancel / no-signal 看的是同一条流的三种结局，
 * 卡片各写一份迟早会「同一个 aborted 帧三页颜色不一样」。
 *
 * 挂载：window.DemoUI.{ PromptCard, AnswerCard, AbortEventCard, UsageBar, ErrorBanner }
 */
(function () {
  window.DemoUI = window.DemoUI || {};

  /**
   * 用户输入 / 请求参数：中性灰，和模型输出区分开，方便回看「当时问的是什么、N 是多少」。
   */
  function PromptCard({ prompt, extra }) {
    return (
      <div className="rounded border border-gray-200 bg-gray-50 p-3">
        <div className="text-xs text-gray-500 mb-1">请求参数</div>
        <div className="text-sm text-gray-700 break-words">
          <span className="font-mono">message:</span> {prompt}
        </div>
        {extra ? <div className="text-xs text-gray-500 mt-1 font-mono">{extra}</div> : null}
      </div>
    );
  }

  /**
   * 模型输出：绿系强调 = 给用户看的终态。streaming 为真时说明还在逐帧追加。
   * 这段字是每帧 event=delta 的 content 拼起来的，不是完整 JSON。
   */
  function AnswerCard({ text, streaming }) {
    return (
      <div className="rounded border border-green-300 bg-green-50 p-3">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs text-green-800">模型回复（由每帧 event=delta 拼起来）</div>
          {streaming ? <div className="text-xs text-gray-500">逐帧追加中…</div> : null}
        </div>
        <pre className="whitespace-pre-wrap break-words text-sm max-h-64 overflow-auto">
          {text || "（还没有内容）"}
        </pre>
      </div>
    );
  }

  /**
   * abort / 忘传 signal 的协议事件卡。
   * kind=aborted：服务端 catch 到 AbortError 后发的帧，reason 告诉你是「N 帧到了」还是「客户端掐了」。
   * kind=no-signal：socket 被关了但 SDK 仍跑完 —— 这不是成功，也不是 HTTP 错，用中性白底 + 警示徽标。
   */
  function AbortEventCard({ kind, reason, frameIdx, hint }) {
    var isAbort = kind === "aborted";
    var cls = isAbort
      ? "rounded border border-red-300 bg-red-50 p-3 space-y-1"
      : "rounded border border-gray-300 bg-white p-3 space-y-1";
    var badge = isAbort
      ? "text-xs px-2 py-0.5 rounded bg-red-200 text-red-800"
      : "text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-700";
    var label = isAbort ? "event=aborted" : "socket 已关 · SDK 仍跑完";
    return (
      <div className={cls}>
        <div className="flex items-center justify-between gap-2">
          <span className={badge}>{label}</span>
          <span className="text-xs text-gray-500">帧数 {frameIdx ?? "?"}</span>
        </div>
        {reason ? (
          <div className="text-xs text-gray-600">
            reason={reason}
            {reason === "frames"
              ? "（服务端收到 N 帧后自己 abort）"
              : reason === "client-close"
                ? "（浏览器掐了 fetch，TCP 断开触发 req.close）"
                : ""}
          </div>
        ) : null}
        {hint ? <div className="text-xs text-gray-600">{hint}</div> : null}
      </div>
    );
  }

  /**
   * 元信息条：帧数 / Token 用量 / 耗时 / 是否收到结束哨兵。
   * 提前 abort 时 usage 经常是空的——不是 bug，是流没跑到最后一帧。
   */
  function UsageBar({ usage, frameIdx, elapsedMs, doneSeen }) {
    return (
      <div className="text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
        <span>帧数 {frameIdx}</span>
        <span>耗时 {elapsedMs} ms</span>
        <span>结束帧 {doneSeen ? "收到 [DONE]" : "未收到"}</span>
        {usage && usage.total_tokens != null ? (
          <span>
            token prompt={usage.prompt_tokens} completion={usage.completion_tokens} total=
            {usage.total_tokens}
          </span>
        ) : (
          <span>usage：本次流里没给（提前 abort 时常见；钱以提供商账单为准）</span>
        )}
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
  window.DemoUI.AbortEventCard = AbortEventCard;
  window.DemoUI.UsageBar = UsageBar;
  window.DemoUI.ErrorBanner = ErrorBanner;
})();
