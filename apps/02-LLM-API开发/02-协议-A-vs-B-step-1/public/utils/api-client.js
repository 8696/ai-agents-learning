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

  /**
   * 故意制造 fetch reject：打本机一个没人听的端口。
   * 这是 §5.3.2「网络错误」那一类，和 HTTP 4xx/5xx 必须能一眼分开。
   */
  window.DemoUtils.triggerNetworkError = async function triggerNetworkError() {
    await fetch("http://127.0.0.1:9/");
  };
})();
