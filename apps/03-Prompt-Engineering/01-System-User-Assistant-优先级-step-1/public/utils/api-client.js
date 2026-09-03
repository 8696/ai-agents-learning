/**
 * 职责：前端 HTTP 小工具（无 JSX）。
 * 数据流：fetch POST → { status, data }；挂 window.DemoUtils。
 * 加载：普通 <script src>，须在 components / 内联块之前。
 */
(function () {
  window.DemoUtils = window.DemoUtils || {};

  /** POST JSON；不抛 HTTP 错，让页面用 status 决定 pill 颜色。 */
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
})();
