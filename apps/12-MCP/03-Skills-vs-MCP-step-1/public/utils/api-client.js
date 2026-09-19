/**
 * 职责：无 JSX 的请求帮手。三条装配各打自己的 URL。
 * 数据流：url + body → fetch JSON → { ok, data, error, status, elapsedMs }。
 */
(function () {
  async function postJson(url, body) {
    const started = Date.now();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(function () { return null; });
    return {
      ok: res.ok && data && data.ok === true,
      status: res.status,
      data: data,
      error: data && data.error ? data.error : (res.ok ? "" : "请求失败 " + res.status),
      elapsedMs: Date.now() - started,
    };
  }

  async function getJson(url) {
    const started = Date.now();
    const res = await fetch(url);
    const data = await res.json().catch(function () { return null; });
    return {
      ok: res.ok,
      status: res.status,
      data: data,
      error: data && data.error ? data.error : (res.ok ? "" : "请求失败 " + res.status),
      elapsedMs: Date.now() - started,
    };
  }

  window.DemoUtils = { postJson: postJson, getJson: getJson };
})();
