/**
 * 职责：浏览器侧 HTTP / SSE 小工具（无 JSX）——切帧、打一次性、故意制造两类错误。
 *
 * 数据流：
 *   consumeSse(url, hooks, init)
 *     → fetch → 非 200：读 JSON 错误体，返回 { ok:false, httpStatus, error }（不抛）
 *     → 200：ReadableStream → 按 "\n\n" 切帧 → 去掉 "data: " 前缀 → JSON.parse
 *     → 每帧 hooks.onFrame；delta.content 另外 hooks.onDelta
 *   fetchBlocking() → GET /api/blocking 整段 text
 *   fetchHttpError(url) → GET url?fail=1，用来演示 400
 *   triggerNetworkError() → 打一个打不到的地址，用来演示 fetch reject
 *
 * 加载：普通 <script src>，必须排在 components / 页面内联块之前。
 */
(function () {
  window.DemoUtils = window.DemoUtils || {};

  /**
   * 给每一帧贴一个语义标签，页面据此决定卡片颜色和徽标。
   * 判断顺序不能乱：先认 error / [DONE] 这种「流的控制信号」，再认正文。
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

  function parseHttpErrorBody(text, status) {
    try {
      var parsed = JSON.parse(text);
      return parsed.error || text;
    } catch (_e) {
      return (text && text.slice(0, 200)) || "HTTP " + status;
    }
  }

  /**
   * 读一条 SSE。三类失败分别有出口，页面不用自己猜：
   *   1) fetch 直接 reject（服务没起 / 网络断）→ 本函数 throw，调用方 catch
   *   2) HTTP 4xx / 5xx（故意 400、没 Key 503）→ 返回 ok:false + httpStatus
   *   3) 流中途上游报错 → 返回 ok:true 但 streamError 有值（头已经发出去了，改不了状态码）
   */
  window.DemoUtils.consumeSse = async function consumeSse(url, hooks, init) {
    var onFrame = (hooks && hooks.onFrame) || function () {};
    var onDelta = (hooks && hooks.onDelta) || function () {};
    var t0 = (typeof performance !== "undefined" ? performance.now() : Date.now());

    var res = await fetch(url, init || {});

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
    var content = "";
    var usage = null;
    var frameCount = 0;
    var doneSeen = false;
    var streamError = "";
    var firstFrameMs = null;

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

        var obj = null;
        try {
          obj = payload === "[DONE]" ? null : JSON.parse(payload);
        } catch (_e) {
          obj = null;
        }

        var kind = classifyFrame(payload, obj);
        frameCount += 1;
        if (firstFrameMs === null) {
          firstFrameMs =
            typeof performance !== "undefined" ? performance.now() - t0 : Date.now() - t0;
        }
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

    var totalMs =
      typeof performance !== "undefined" ? performance.now() - t0 : Date.now() - t0;

    return {
      ok: true,
      httpStatus: 200,
      content: content,
      usage: usage,
      frameCount: frameCount,
      doneSeen: doneSeen,
      streamError: streamError,
      firstFrameMs: firstFrameMs,
      totalMs: totalMs,
    };
  };

  /** GET /api/blocking：整段 text/plain。非 200 返回 ok:false，fetch reject 则抛。 */
  window.DemoUtils.fetchBlocking = async function fetchBlocking() {
    var t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    var res = await fetch("/api/blocking");
    var now = typeof performance !== "undefined" ? performance.now() : Date.now();
    var totalMs = now - t0;
    if (!res.ok) {
      var text = await res.text();
      return {
        ok: false,
        httpStatus: res.status,
        error: parseHttpErrorBody(text, res.status),
        totalMs: totalMs,
      };
    }
    var body = await res.text();
    return { ok: true, httpStatus: 200, text: body, totalMs: totalMs };
  };

  /** 故意 400：在 url 上加 ?fail=1，对应服务端 isIntentionalFail。 */
  window.DemoUtils.fetchHttpError = async function fetchHttpError(url) {
    var sep = url.indexOf("?") >= 0 ? "&" : "?";
    var res = await fetch(url + sep + "fail=1");
    var text = await res.text();
    return {
      ok: res.ok,
      httpStatus: res.status,
      error: parseHttpErrorBody(text, res.status),
    };
  };

  /**
   * 故意制造 fetch reject：打本机一个没人听的端口。
   * 这是 §5.3.2「网络错误」那一类，和 HTTP 4xx/5xx 必须能一眼分开。
   */
  window.DemoUtils.triggerNetworkError = async function triggerNetworkError() {
    await fetch("http://127.0.0.1:9/");
  };
})();
