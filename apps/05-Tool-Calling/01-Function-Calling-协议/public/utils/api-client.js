/**
 * 职责：前端 HTTP 小工具（无 JSX）。
 * 数据流：fetch → { status, data }；挂 window.DemoUtils。
 * 加载：普通 <script src>，须在 components / 内联块之前。
 */
(function () {
  window.DemoUtils = window.DemoUtils || {};

  /** POST JSON；不抛错，让页面用 status 决定 pill 颜色。 */
  window.DemoUtils.callEndpoint = async function callEndpoint(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_e) {
      data = { error: "响应不是合法 JSON：" + text.slice(0, 200) };
    }
    return { status: res.status, data: data };
  };

  /** 总览 / 场景页启动：环境 + Registry。 */
  window.DemoUtils.fetchHealthAndTools = function fetchHealthAndTools() {
    return Promise.all([
      fetch("/health").then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      }),
      fetch("/tools").then(function (r) {
        return r.ok ? r.json() : [];
      }),
    ]);
  };
})();
