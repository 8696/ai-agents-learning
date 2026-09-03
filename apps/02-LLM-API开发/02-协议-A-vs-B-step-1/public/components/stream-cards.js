/**
 * 职责：流式三栏 —— 事件流 / thinking 累加 / answer 累加。
 * kind 着色：role 蓝、chunk 灰、finish 橙、usage 绿；B 的 thinking 紫、text 蓝。
 * 挂载：window.DemoUI.{ splitProtocolADelta, kindClass, eventClass, StreamColumns, PromptCard }
 */
(function () {
  window.DemoUI = window.DemoUI || {};

  var THINK_OPEN = "<think>";
  var THINK_CLOSE = "</think>";

  /**
   * 协议 A 流式切思考：独立字段优先，否则用 content 里的标记状态机。
   * 状态必须跨帧保留，否则标记被拆到两帧就会切错。
   */
  function splitProtocolADelta(delta, state) {
    var details = Array.isArray(delta && delta.reasoning_details) ? delta.reasoning_details : [];
    var pieces = [];
    for (var i = 0; i < details.length; i++) {
      if (details[i] && typeof details[i].text === "string" && details[i].text) pieces.push(details[i].text);
    }
    if (pieces.length === 0 && delta && typeof delta.reasoning_content === "string" && delta.reasoning_content) {
      pieces.push(delta.reasoning_content);
    } else if (pieces.length === 0 && delta && typeof delta.reasoning === "string" && delta.reasoning) {
      pieces.push(delta.reasoning);
    } else if (pieces.length === 0 && delta && typeof delta.thinking === "string" && delta.thinking) {
      pieces.push(delta.thinking);
    }
    if (pieces.length > 0) {
      var thinking = "";
      for (var p = 0; p < pieces.length; p++) {
        var piece = pieces[p];
        if (piece.indexOf(state.reasoningSeen) === 0) {
          thinking += piece.slice(state.reasoningSeen.length);
          state.reasoningSeen = piece;
        } else {
          thinking += piece;
          state.reasoningSeen += piece;
        }
      }
      return { thinking: thinking, content: delta && typeof delta.content === "string" ? delta.content : "" };
    }
    var raw = delta && typeof delta.content === "string" ? delta.content : "";
    if (!raw) return { thinking: "", content: "" };
    var outThink = "";
    var outContent = "";
    var cursor = 0;
    while (cursor < raw.length) {
      if (state.inThink) {
        var endIdx = raw.indexOf(THINK_CLOSE, cursor);
        if (endIdx === -1) {
          outThink += raw.slice(cursor);
          break;
        }
        outThink += raw.slice(cursor, endIdx);
        cursor = endIdx + THINK_CLOSE.length;
        state.inThink = false;
      } else {
        var startIdx = raw.indexOf(THINK_OPEN, cursor);
        if (startIdx === -1) {
          outContent += raw.slice(cursor);
          break;
        }
        outContent += raw.slice(cursor, startIdx);
        cursor = startIdx + THINK_OPEN.length;
        state.inThink = true;
      }
    }
    return { thinking: outThink, content: outContent };
  }

  function kindClass(kind) {
    if (kind === "role") return "text-blue-700";
    if (kind === "finish") return "text-orange-700";
    if (kind === "usage") return "text-green-700";
    return "text-gray-600";
  }

  function eventClass(cls) {
    if (cls === "thinking-event") return "text-purple-700";
    if (cls === "text-event") return "text-blue-700";
    if (cls === "message-delta") return "text-orange-700";
    if (cls === "message-stop") return "text-green-700";
    return "text-gray-700";
  }

  function StreamColumns({
    lines,
    thinking,
    answer,
    meta,
    elapsed,
    thinkingEmpty,
    answerEmpty,
    thinkingTitle,
    answerTitle,
    countLabel,
  }) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
        <div className="border border-gray-300 rounded p-2 flex flex-col min-h-[280px] bg-white">
          <h3 className="m-0 mb-2 text-xs flex justify-between items-center font-semibold">
            <span>事件流（协议事件，按顺序）</span>
            <span className="font-normal text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
              {lines.length} {countLabel || "frames"} · {elapsed}s
            </span>
          </h3>
          <div className="flex-1 overflow-auto max-h-[360px] font-mono text-[11px] leading-snug">
            {lines.length === 0 && <span className="text-gray-400">（还没有帧）</span>}
            {lines.map(function (l, i) {
              return (
                <div
                  key={i}
                  className={"py-0.5 px-1 border-b border-dotted border-gray-200 flex gap-2 items-baseline " + (l.cls || "")}
                >
                  <span className="text-gray-500 min-w-[32px]">#{l.idx}</span>
                  <span className={"font-bold min-w-[80px] " + (l.tone || "")}>{l.label}</span>
                  <span className="text-gray-700 flex-1 truncate">{l.summary}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="border border-gray-300 rounded p-2 flex flex-col min-h-[280px]">
          <h3 className="m-0 mb-2 text-xs flex justify-between items-center font-semibold">
            <span>{thinkingTitle}</span>
            <span className="font-normal text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
              {thinking.length} 字符
            </span>
          </h3>
          <div className="flex-1 whitespace-pre-wrap break-words leading-relaxed text-[13px] overflow-auto max-h-[360px] p-1.5 bg-purple-50 rounded text-gray-600 italic">
            {thinking || <span className="text-gray-400 not-italic">{thinkingEmpty}</span>}
          </div>
        </div>
        <div className="border border-green-300 bg-green-50 rounded p-2 flex flex-col min-h-[280px]">
          <h3 className="m-0 mb-2 text-xs flex justify-between items-center font-semibold">
            <span>{answerTitle}</span>
            <span className="font-normal text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
              {answer.length} 字符
            </span>
          </h3>
          <div className="flex-1 whitespace-pre-wrap break-words leading-relaxed text-[13px] overflow-auto max-h-[360px] p-1.5 rounded">
            {answer || <span className="text-gray-400">{answerEmpty}</span>}
          </div>
          <div className="mt-2 text-gray-600 text-xs border-t border-dashed border-gray-200 pt-1.5 break-all">
            {meta && <code>{meta}</code>}
          </div>
        </div>
      </div>
    );
  }

  function PromptCard({ text }) {
    if (!text) return null;
    return (
      <div className="bg-gray-50 text-gray-700 rounded p-2 text-xs">
        <span className="font-semibold">prompt: </span>
        {text}
      </div>
    );
  }

  window.DemoUI.splitProtocolADelta = splitProtocolADelta;
  window.DemoUI.kindClass = kindClass;
  window.DemoUI.eventClass = eventClass;
  window.DemoUI.StreamColumns = StreamColumns;
  window.DemoUI.PromptCard = PromptCard;
})();
