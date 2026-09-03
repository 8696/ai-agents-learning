/**
 * 职责：浏览器侧的 SSE 客户端（无 JSX）—— 把三个 abort 端点的字节流切成事件。
 *
 * 数据流：
 *   streamAbortCase({ url, body, signal, onEvent })
 *     → fetch POST
 *     → 非 200：读 JSON 错误体，返回 { ok:false, httpStatus, error }（不抛）
 *     → 200：ReadableStream → 按 "\\n\\n" 切帧 → 去掉 "data: " 前缀 → JSON.parse
 *     → 每帧回调 onEvent(evt)；delta 另外累加 content
 *     → 返回 { ok, content, frameIdx, usage, aborted, doneSeen, streamError }
 *
 * 加载：普通 script src，必须排在 components / 页面内联块之前。
 * 为什么单独成文件：三个场景页用的是同一套事件（delta / usage / aborted / error / [DONE]），
 * 解析逻辑重复三遍迟早会「同一帧三页解释不一致」。
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

  /**
   * 跑一次 abort 对照流。
   * 三类失败分别有出口，页面不用自己猜：
   *   1) fetch 直接 reject（服务没起 / 网络断）→ 本函数 throw，调用方 catch
   *   2) HTTP 4xx / 5xx（参数错 400、没 Key 503）→ 返回 ok:false + httpStatus
   *   3) 流中途上游报错 → 返回 ok:true 但 streamError 有值（头已经发出去了，改不了状态码）
   *   4) 调用方 abort signal → fetch 抛 AbortError，调用方按「客户端取消」处理，不当网络错
   */
  window.DemoUtils.streamAbortCase = async function streamAbortCase(opts) {
    var url = opts.url;
    var body = opts.body || {};
    var signal = opts.signal;
    var onEvent = opts.onEvent || function () {};

    var res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: signal,
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
    var content = "";
    var frameIdx = 0;
    var usage = null;
    var aborted = null;
    var doneSeen = false;
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

        if (payload === "[DONE]") {
          doneSeen = true;
          onEvent({ event: "done" });
          continue;
        }

        var evt = null;
        try {
          evt = JSON.parse(payload);
        } catch (_e) {
          continue;
        }

        onEvent(evt);

        if (evt.event === "delta") {
          content += evt.content || "";
          frameIdx = evt.frameIdx || frameIdx;
        } else if (evt.event === "usage") {
          usage = evt.usage;
          if (evt.frameIdx) frameIdx = evt.frameIdx;
        } else if (evt.event === "aborted") {
          aborted = evt;
          if (evt.frameIdx) frameIdx = evt.frameIdx;
          if (evt.usage) usage = evt.usage;
        } else if (evt.event === "error") {
          streamError =
            evt.message +
            (evt.upstreamStatus ? "（上游 HTTP " + evt.upstreamStatus + "）" : "");
        }
      }
    }

    return {
      ok: true,
      httpStatus: 200,
      content: content,
      frameIdx: frameIdx,
      usage: usage,
      aborted: aborted,
      doneSeen: doneSeen,
      streamError: streamError,
    };
  };
})();
