/**
 * 职责：页面发 JSON 请求。无 JSX，挂 window.DemoUtils。
 *
 * 数据流：fetch → 解析 JSON；HTTP 非 2xx 仍把 body 带回，让输出区画红字。
 */
(function () {
  window.DemoUtils = window.DemoUtils || {};

  window.DemoUtils.fetchHealth = async function fetchHealth() {
    const res = await fetch("/health");
    if (!res.ok) throw new Error("GET /health 失败：" + res.status);
    return res.json();
  };

  window.DemoUtils.postJson = async function postJson(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let data = null;
    try {
      data = await res.json();
    } catch (_err) {
      data = { ok: false, error: "响应不是 JSON" };
    }
    return { ok: res.ok, status: res.status, data };
  };
})();
