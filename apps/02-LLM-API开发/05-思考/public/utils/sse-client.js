/**
 * 职责：浏览器侧 SSE / 错误演示小工具（无 JSX）。
 * 数据流：
 *   consumeSse(url, body, onEvent, signal)
 *     → POST JSON → 非 200：返回 { ok:false, httpStatus, error }（不抛）
 *     → 200：按 "\n\n" 切帧 → onEvent(obj)
 *   triggerNetworkError() → 打一个打不到的地址，用来演示 fetch reject
 *
 * 加载：普通 <script src>，必须排在 components / 页面内联块之前。
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

  /**
   * 读一条本 Demo 的 SSE。三类失败分别有出口：
   *   1) fetch 直接 reject（服务没起 / 网络断）→ 本函数 throw，调用方 catch
   *   2) HTTP 4xx / 5xx（空 messages 400、没 Key 400）→ 返回 ok:false + httpStatus
   *   3) 流中途上游报错 → 返回 ok:true 但 streamError 有值（头已经 200，改不了状态码）
   */
  window.DemoUtils.consumeSse = async function consumeSse(url, body, onEvent, signal) {
    var emit = typeof onEvent === "function" ? onEvent : function () {};
    var res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
      signal: signal,
    });

    if (!res.ok) {
      var text = await res.text();
      return {
        ok: false,
        httpStatus: res.status,
        error: parseHttpErrorBody(text, res.status),
      };
    }
    if (!res.body) {
      return { ok: false, httpStatus: res.status, error: "响应没有 body" };
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
        if (payload === null || payload === "[DONE]") continue;
        var obj;
        try {
          obj = JSON.parse(payload);
        } catch (_e) {
          continue;
        }
        if (obj.type === "error") streamError = obj.error || "上游错误";
        emit(obj);
      }
    }

    return { ok: true, httpStatus: 200, streamError: streamError };
  };

  /**
   * 故意制造 fetch reject：打本机一个没人听的端口。
   * 这是 §5.3.2「网络错误」那一类，和 HTTP 4xx/5xx 必须能一眼分开。
   */
  window.DemoUtils.triggerNetworkError = async function triggerNetworkError() {
    await fetch("http://127.0.0.1:9/");
  };
})();
