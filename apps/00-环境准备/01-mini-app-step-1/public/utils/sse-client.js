/**
 * 职责：浏览器侧的 SSE 客户端（无 JSX）—— 把 POST /api/chat 的字节流切成一帧一帧。
 *
 * 数据流：
 *   streamChat(message, hooks)
 *     → fetch POST /api/chat
 *     → 非 200：读 JSON 错误体，返回 { ok:false, httpStatus, error }（不抛）
 *     → 200：ReadableStream → 按 "\n\n" 切帧 → 去掉 "data: " 前缀 → JSON.parse
 *     → 每帧回调 hooks.onFrame(frame)；正文增量另外回调 hooks.onDelta(delta, fullText)
 *     → 返回 { ok:true, content, usage, frameCount, doneSeen, streamError }
 *
 * 加载：普通 <script src>，必须排在 components / 页面内联块之前。
 * 为什么单独成文件：两个页面（chat / frames）用的是同一条流，
 * 差别只在「怎么显示」；解析逻辑重复两遍迟早会解释不一致。
 */
(function () {
  window.DemoUtils = window.DemoUtils || {};

  /**
   * 给每一帧贴一个语义标签，页面据此决定卡片颜色和徽标。
   * 判断顺序不能乱：一帧可能同时有 content 和 finish_reason，
   * 先认 error / [DONE] 这种「流的控制信号」，再认正文。
   */
  function classifyFrame(payload, obj) {
    if (payload === "[DONE]") return "done";
    if (!obj) return "unparsed";
    if (obj.error) return "error";
    var choice = obj.choices && obj.choices[0];
    if (choice && choice.delta && choice.delta.content) return "delta";
    if (choice && choice.finish_reason) return "finish";
    if (obj.usage) return "usage";
    return "meta";
  }

  /** 只解析出一帧的 data 行；SSE 允许多行，本 Demo 服务端只发单行 data。 */
  function readDataLine(rawFrame) {
    var lines = rawFrame.split("\n");
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf("data:") === 0) return lines[i].slice(5).trim();
    }
    return null;
  }

  /**
   * 跑一次流式对话。
   * 三类失败分别有出口，页面不用自己猜：
   *   1) fetch 直接 reject（服务没起 / 网络断）→ 本函数 throw，调用方 catch
   *   2) HTTP 4xx / 5xx（参数错 400、没 Key 503）→ 返回 ok:false + httpStatus
   *   3) 流中途上游报错 → 返回 ok:true 但 streamError 有值（头已经发出去了，改不了状态码）
   */
  window.DemoUtils.streamChat = async function streamChat(message, hooks) {
    var onFrame = (hooks && hooks.onFrame) || function () {};
    var onDelta = (hooks && hooks.onDelta) || function () {};

    var res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message }),
    });

    if (!res.ok || !res.body) {
      var text = await res.text();
      var errMsg = text;
      try {
        var parsed = JSON.parse(text);
        errMsg = parsed.error || text;
      } catch (_e) {
        /* 上游返回的不是 JSON（比如网关的 HTML 错误页），原样显示前 200 字 */
        errMsg = text.slice(0, 200) || "HTTP " + res.status;
      }
      return { ok: false, httpStatus: res.status, error: errMsg };
    }

    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    var buffer = "";
    var content = "";
    var usage = null;
    var frameCount = 0;
    var doneSeen = false;
    var streamError = "";

    while (true) {
      var step = await reader.read();
      if (step.done) break;
      buffer += decoder.decode(step.value, { stream: true });

      // 一帧以空行结束；没收满就留在 buffer 里等下一个 chunk
      var idx;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        var rawFrame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        var payload = readDataLine(rawFrame);
        if (payload === null) continue;

        var obj = null;
        try {
          obj = payload === "[DONE]" ? null : JSON.parse(payload);
        } catch (_e) {
          obj = null;
        }

        var kind = classifyFrame(payload, obj);
        frameCount += 1;
        onFrame({ index: frameCount, kind: kind, payload: payload, obj: obj });

        if (kind === "done") {
          doneSeen = true;
          continue;
        }
        if (kind === "error") {
          streamError =
            obj.error + (obj.upstreamStatus ? "（上游 HTTP " + obj.upstreamStatus + "）" : "");
          continue;
        }
        if (kind === "delta") {
          var delta = obj.choices[0].delta.content;
          content += delta;
          onDelta(delta, content);
        }
        if (obj && obj.usage) usage = obj.usage;
      }
    }

    return {
      ok: true,
      httpStatus: 200,
      content: content,
      usage: usage,
      frameCount: frameCount,
      doneSeen: doneSeen,
      streamError: streamError,
    };
  };
})();
