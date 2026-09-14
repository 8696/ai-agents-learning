/**
 * 职责：无 JSX 的 fetch 封装。挂 window.DemoUtils。
 * 数据流：url + options → { ok, status, json }；4xx/5xx 不 throw，交给页面分通道。
 */
(function () {
  const DemoUtils = window.DemoUtils || (window.DemoUtils = {});

  DemoUtils.fetchJson = async function fetchJson(url, options) {
    const response = await fetch(url, options);
    let json = null;
    try {
      json = await response.json();
    } catch (_err) {
      json = { ok: false, error: "响应不是 JSON" };
    }
    return { httpStatus: response.status, json: json };
  };
})();