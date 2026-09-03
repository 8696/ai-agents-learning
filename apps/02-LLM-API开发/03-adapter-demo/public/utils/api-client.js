/**
 * 职责：前端 HTTP 小工具（无 JSX）。
 * 数据流：POST JSON → { status, data }；流式另见 sse-client.js。
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
})();
