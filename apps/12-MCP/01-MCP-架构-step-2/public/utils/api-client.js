/**
 * 职责：无 JSX 的 fetch 封装。挂 window.DemoUtils。
 * 数据流：url + body → fetch → { httpOk, httpStatus, json }
 */
(function () {
  async function postJson(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let json = null;
    try {
      json = await res.json();
    } catch (_err) {
      json = { ok: false, error: "响应不是 JSON" };
    }
    return { httpOk: res.ok, httpStatus: res.status, json: json };
  }

  async function getJson(url) {
    const res = await fetch(url);
    let json = null;
    try {
      json = await res.json();
    } catch (_err) {
      json = { ok: false, error: "响应不是 JSON" };
    }
    return { httpOk: res.ok, httpStatus: res.status, json: json };
  }

  window.DemoUtils = { postJson: postJson, getJson: getJson };
})();
