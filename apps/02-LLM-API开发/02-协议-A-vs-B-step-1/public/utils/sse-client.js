/**
 * 职责：读 POST SSE，按 \n\n 切帧回调 JSON 对象。
 * 数据流：fetch → 非 200 返回 {ok:false, httpStatus}；200 则 onFrame(obj)，[DONE] 跳过。
 * 加载：普通 <script src>，挂 window.DemoUtils.consumeSse。
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

  function parseHttpErrorBody(text, status) {
    try {
      var parsed = JSON.parse(text);
      return parsed.error || text;
    } catch (_e) {
      return (text && text.slice(0, 200)) || "HTTP " + status;
    }
  }

  window.DemoUtils.consumeSse = async function consumeSse(url, body, onFrame) {
    var res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });

    if (!res.ok || !res.body) {
      var text = await res.text();
      return {
        ok: false,
        httpStatus: res.status,
        error: parseHttpErrorBody(text, res.status),
      };
    }

    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    var buffer = "";
    var frameCount = 0;
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
        if (obj && obj.error) {
          streamError = String(obj.error);
        }
        frameCount += 1;
        if (onFrame) onFrame(obj, frameCount);
      }
    }

    return { ok: true, httpStatus: 200, frameCount: frameCount, streamError: streamError };
  };
})();
