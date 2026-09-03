/**
 * 职责：前端 HTTP 小工具（无 JSX）—— 发 POST、翻译失败、故意制造 fetch reject。
 * 数据流：fetch → { status, data }；挂 window.DemoUtils。
 * 加载：普通 <script src>，须在 components / 内联块之前。
 */
(function () {
  window.DemoUtils = window.DemoUtils || {};

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

  window.DemoUtils.describeFailure = function describeFailure(status, data) {
    const base = (data && data.error) || "HTTP " + status;
    if (status === 400) return "参数被服务端闸门拦下：" + base;
    return "HTTP " + status + " · " + base;
  };

  window.DemoUtils.triggerNetworkError = async function triggerNetworkError() {
    await fetch("http://127.0.0.1:9/");
  };
})();
