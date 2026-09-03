/**
 * 职责：读 POST /api/chat-stream 的 SSE，按帧回调 UnifiedDelta。
 * 数据流：fetch → \n\n 切帧 → JSON.parse → onDelta；[DONE] 结束。
 */
(function () {
  window.DemoUtils = window.DemoUtils || {};

  function readDataLine(rawFrame) {
    var lines = rawFrame.split("\n");
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf("data:") === 0) return lines[i].slice(5).trim();
    }
    return null;
  }

  window.DemoUtils.streamUnified = async function streamUnified(body, onDelta) {
    var res = await fetch("/api/chat-stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) {
      var text = await res.text();
      var errMsg = text;
      try {
        var parsed = JSON.parse(text);
        errMsg = parsed.error || text;
      } catch (_e) {
        errMsg = text.slice(0, 200) || "HTTP " + res.status;
      }
      return { ok: false, httpStatus: res.status, error: errMsg };
    }

    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    var buffer = "";
    var streamError = "";

    while (true) {
      var step = await reader.read();
      if (step.done) break;
      buffer += decoder.decode(step.value, { stream: true });
      var idx;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        var rawFrame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        var payload = readDataLine(rawFrame);
        if (payload === null) continue;
        if (payload === "[DONE]") continue;
        var obj = null;
        try {
          obj = JSON.parse(payload);
        } catch (_e) {
          continue;
        }
        if (obj.type === "_error") {
          streamError = obj.error || "流中错误";
          continue;
        }
        onDelta(obj);
      }
    }
    return { ok: true, httpStatus: 200, streamError: streamError };
  };
})();
